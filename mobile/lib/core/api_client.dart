import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  ApiException(this.message, this.status);

  final String message;
  final int status;

  @override
  String toString() => message;
}

/// Where tokens and the chosen company are kept between launches.
abstract class KeyValueStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class SecureKeyValueStore implements KeyValueStore {
  SecureKeyValueStore([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) => _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

class MemoryKeyValueStore implements KeyValueStore {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);
}

const _accessKey = 'access_token';
const _refreshKey = 'refresh_token';
const _tenantKey = 'tenant_id';
const _serverKey = 'server_url';

class ApiClient {
  ApiClient({required this.store, required this.baseUrl, http.Client? client}) : _client = client ?? http.Client();

  final KeyValueStore store;
  final http.Client _client;
  String baseUrl;
  int? tenantId;
  String? _access;
  String? _refresh;
  Future<void>? _refreshing;

  /// Called when a session can no longer be renewed.
  void Function()? onSessionExpired;

  bool get hasSession => _access != null;

  Future<void> restore() async {
    _access = await store.read(_accessKey);
    _refresh = await store.read(_refreshKey);
    final tenant = await store.read(_tenantKey);
    tenantId = tenant == null ? null : int.tryParse(tenant);
    final server = await store.read(_serverKey);
    if (server != null && server.isNotEmpty) baseUrl = server;
  }

  Future<void> setServer(String url) async {
    baseUrl = normalizeBaseUrl(url);
    await store.write(_serverKey, baseUrl);
  }

  Future<void> setTenant(int? id) async {
    tenantId = id;
    if (id == null) {
      await store.delete(_tenantKey);
    } else {
      await store.write(_tenantKey, '$id');
    }
  }

  Future<void> _saveTokens(Map<String, dynamic> body) async {
    _access = body['accessToken'] as String;
    _refresh = body['refreshToken'] as String;
    await store.write(_accessKey, _access!);
    await store.write(_refreshKey, _refresh!);
  }

  Future<void> clearSession() async {
    _access = null;
    _refresh = null;
    tenantId = null;
    await store.delete(_accessKey);
    await store.delete(_refreshKey);
    await store.delete(_tenantKey);
  }

  Future<void> login(String identifier, String password) async {
    final body = await request(
      'POST',
      '/auth/login',
      body: identifier.contains('@') ? {'email': identifier, 'password': password} : {'username': identifier, 'password': password},
      authenticated: false,
    );
    await _saveTokens(body as Map<String, dynamic>);
  }

  Future<void> logout() async {
    final refresh = _refresh;
    try {
      if (refresh != null) {
        await request('POST', '/auth/logout', body: {'refreshToken': refresh}, authenticated: false);
      }
    } on ApiException {
      // Signing out always succeeds locally, even if the server cannot be reached.
    } finally {
      await clearSession();
    }
  }

  Future<dynamic> request(
    String method,
    String path, {
    Map<String, String>? query,
    Object? body,
    bool authenticated = true,
    bool retry = true,
  }) async {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query == null || query.isEmpty ? null : query);
    final request = http.Request(method, uri);
    request.headers['Accept'] = 'application/json';
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    if (authenticated && _access != null) request.headers['Authorization'] = 'Bearer $_access';
    if (authenticated && tenantId != null) request.headers['X-Tenant-Id'] = '$tenantId';

    http.Response response;
    try {
      response = await http.Response.fromStream(await _client.send(request).timeout(const Duration(seconds: 25)));
    } on TimeoutException {
      throw ApiException('The server took too long to respond. Check your connection and try again.', 0);
    } on Exception {
      throw ApiException('Unable to reach the server. Check your internet connection.', 0);
    }

    if (response.statusCode == 401 && authenticated && retry && _refresh != null) {
      try {
        await _renew();
      } on ApiException {
        await clearSession();
        onSessionExpired?.call();
        throw ApiException('Your session has expired. Please sign in again.', 401);
      }
      return this.request(method, path, query: query, body: body, authenticated: authenticated, retry: false);
    }

    dynamic decoded;
    if (response.body.isNotEmpty) {
      try {
        decoded = jsonDecode(utf8.decode(response.bodyBytes));
      } on FormatException {
        decoded = null;
      }
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = decoded is Map && decoded['message'] is String ? decoded['message'] as String : 'Request failed (${response.statusCode})';
      throw ApiException(message, response.statusCode);
    }
    return decoded;
  }

  Future<void> _renew() {
    return _refreshing ??= () async {
      try {
        final body = await request('POST', '/auth/refresh-token', body: {'refreshToken': _refresh}, authenticated: false);
        await _saveTokens(body as Map<String, dynamic>);
      } finally {
        _refreshing = null;
      }
    }();
  }

  Future<Map<String, dynamic>> getMap(String path, {Map<String, String>? query}) async =>
      (await request('GET', path, query: query)) as Map<String, dynamic>;

  /// Reads every page of a list endpoint.
  Future<List<Map<String, dynamic>>> fetchAll(String endpoint, {Map<String, String> query = const {}, int maxPages = 20}) async {
    final rows = <Map<String, dynamic>>[];
    for (var page = 1; page <= maxPages; page++) {
      final result = await getMap('/$endpoint', query: {...query, 'page': '$page', 'limit': '100'});
      final data = (result['data'] as List).cast<Map<String, dynamic>>();
      rows.addAll(data);
      final total = (result['pagination']['total'] as num).toInt();
      if (rows.length >= total || data.isEmpty) break;
    }
    return rows;
  }
}

/// Accepts "api.example.com", "http://10.0.0.5:3000" and "https://x/api" and returns an API root.
String normalizeBaseUrl(String input) {
  var url = input.trim();
  if (url.isEmpty) return url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://$url';
  url = url.replaceAll(RegExp(r'/+$'), '');
  if (!url.endsWith('/api')) url = '$url/api';
  return url;
}

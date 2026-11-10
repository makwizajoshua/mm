import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:marketmesh_mobile/core/api_client.dart';

http.Response _json(Object body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  test('sends bearer token and company headers', () async {
    late http.BaseRequest seen;
    final store = MemoryKeyValueStore()
      ..values['access_token'] = 'tok'
      ..values['refresh_token'] = 'ref'
      ..values['tenant_id'] = '7';
    final api = ApiClient(
      store: store,
      baseUrl: 'http://test/api',
      client: MockClient((request) async {
        seen = request;
        return _json({'ok': true});
      }),
    );
    await api.restore();
    await api.request('GET', '/products', query: {'limit': '5'});
    expect(seen.url.toString(), 'http://test/api/products?limit=5');
    expect(seen.headers['Authorization'], 'Bearer tok');
    expect(seen.headers['X-Tenant-Id'], '7');
  });

  test('turns server errors into readable exceptions', () async {
    final api = ApiClient(store: MemoryKeyValueStore(), baseUrl: 'http://test/api', client: MockClient((_) async => _json({'message': 'Not enough stock'}, 409)));
    expect(
      () => api.request('POST', '/sales', body: {}),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'Not enough stock').having((e) => e.status, 'status', 409)),
    );
  });

  test('reports an unreachable server', () async {
    final api = ApiClient(store: MemoryKeyValueStore(), baseUrl: 'http://test/api', client: MockClient((_) async => throw http.ClientException('no route')));
    expect(() => api.request('GET', '/x'), throwsA(isA<ApiException>().having((e) => e.status, 'status', 0)));
  });

  test('renews an expired access token once and retries', () async {
    var protectedCalls = 0;
    final store = MemoryKeyValueStore()
      ..values['access_token'] = 'old'
      ..values['refresh_token'] = 'r1';
    final api = ApiClient(
      store: store,
      baseUrl: 'http://test/api',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/auth/refresh-token')) return _json({'accessToken': 'new', 'refreshToken': 'r2'});
        protectedCalls++;
        return request.headers['Authorization'] == 'Bearer new' ? _json({'ok': true}) : _json({'message': 'expired'}, 401);
      }),
    );
    await api.restore();
    expect(await api.request('GET', '/users/me'), {'ok': true});
    expect(protectedCalls, 2);
    expect(store.values['access_token'], 'new');
    expect(store.values['refresh_token'], 'r2');
  });

  test('clears the session and notifies when renewal fails', () async {
    final store = MemoryKeyValueStore()
      ..values['access_token'] = 'old'
      ..values['refresh_token'] = 'bad';
    final api = ApiClient(store: store, baseUrl: 'http://test/api', client: MockClient((_) async => _json({'message': 'nope'}, 401)));
    var expired = 0;
    api.onSessionExpired = () => expired++;
    await api.restore();
    await expectLater(api.request('GET', '/users/me'), throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)));
    expect(expired, 1);
    expect(store.values, isEmpty);
    expect(api.hasSession, isFalse);
  });

  test('fetchAll walks every page', () async {
    final api = ApiClient(
      store: MemoryKeyValueStore(),
      baseUrl: 'http://test/api',
      client: MockClient((request) async {
        final page = int.parse(request.url.queryParameters['page']!);
        return _json({
          'data': page == 1 ? [{'id': 1}, {'id': 2}] : [{'id': 3}],
          'pagination': {'page': page, 'limit': 100, 'total': 3},
        });
      }),
    );
    final rows = await api.fetchAll('products');
    expect(rows.map((r) => r['id']), [1, 2, 3]);
  });
}

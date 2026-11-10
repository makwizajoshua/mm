import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'models.dart';

enum SessionPhase { starting, signedOut, chooseCompany, ready }

/// Sign-in state, the active company and what the user may do in it.
class SessionController extends ChangeNotifier {
  SessionController(this.api) {
    api.onSessionExpired = () {
      _reset();
      notice = 'Your session expired. Please sign in again.';
      notifyListeners();
    };
  }

  final ApiClient api;

  SessionPhase phase = SessionPhase.starting;
  Map<String, dynamic>? user;
  List<Company> companies = [];
  Company? company;
  Access? access;
  String? notice;

  String get displayName => access?.employee?.fullName ?? '${user?['username'] ?? ''}';

  Future<void> start() async {
    await api.restore();
    if (!api.hasSession) {
      phase = SessionPhase.signedOut;
      notifyListeners();
      return;
    }
    try {
      await _loadWorkspace();
    } on ApiException catch (error) {
      if (error.status == 401 || error.status == 403) {
        await api.clearSession();
        _reset();
        notice = error.message;
      } else {
        // Offline at launch: keep the session and let the user retry from the sign-in screen.
        _reset();
        notice = error.message;
      }
      phase = SessionPhase.signedOut;
    }
    notifyListeners();
  }

  Future<void> signIn(String identifier, String password) async {
    notice = null;
    await api.login(identifier.trim(), password);
    try {
      await _loadWorkspace();
    } on ApiException {
      await api.logout();
      _reset();
      rethrow;
    }
    notifyListeners();
  }

  Future<void> _loadWorkspace() async {
    user = await api.getMap('/users/me');
    final result = await api.getMap('/users/me/tenants');
    companies = (result['data'] as List).map((e) => Company.fromJson(e as Map<String, dynamic>)).toList();
    if (companies.isEmpty) {
      throw ApiException('Your login is not linked to a company. Ask the company owner to set up your access.', 403);
    }
    final remembered = companies.where((c) => c.id == api.tenantId);
    if (remembered.isNotEmpty) {
      await selectCompany(remembered.first, notify: false);
    } else if (companies.length == 1) {
      await selectCompany(companies.first, notify: false);
    } else {
      phase = SessionPhase.chooseCompany;
    }
  }

  Future<void> selectCompany(Company next, {bool notify = true}) async {
    await api.setTenant(next.id);
    try {
      access = Access.fromJson(await api.getMap('/access'));
    } on ApiException {
      await api.setTenant(null);
      rethrow;
    }
    company = next;
    phase = SessionPhase.ready;
    if (notify) notifyListeners();
  }

  void chooseAnotherCompany() {
    phase = SessionPhase.chooseCompany;
    notifyListeners();
  }

  Future<void> refreshAccess() async {
    access = Access.fromJson(await api.getMap('/access'));
    notifyListeners();
  }

  Future<void> signOut() async {
    await api.logout();
    _reset();
    notifyListeners();
  }

  void _reset() {
    user = null;
    companies = [];
    company = null;
    access = null;
    phase = SessionPhase.signedOut;
  }
}

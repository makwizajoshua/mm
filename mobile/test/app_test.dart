import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:marketmesh_mobile/core/api_client.dart';
import 'package:marketmesh_mobile/core/session.dart';
import 'package:marketmesh_mobile/ui/home_shell.dart';

http.Response _json(Object body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

Map<String, dynamic> _page(List<Map<String, dynamic>> rows) => {
      'data': rows,
      'pagination': {'page': 1, 'limit': 100, 'total': rows.length},
    };

Map<String, dynamic> _access(String role) {
  switch (role) {
    case 'cashier':
      return {
        'isAdmin': false,
        'roles': ['cashier'],
        'employee': {'id': 2, 'firstName': 'Mphatso', 'lastName': 'Phiri', 'employeeNumber': 'EMP-002'},
        'storeIds': [1],
        'permissions': {
          'sales': {'read': false, 'write': true},
          'stock-items': {'read': true, 'write': false},
          'transactions': {'read': false, 'write': false},
        },
      };
    case 'accountant':
      return {
        'isAdmin': false,
        'roles': ['accountant'],
        'employee': {'id': 4, 'firstName': 'Grace', 'lastName': 'Kachingwe', 'employeeNumber': 'EMP-004'},
        'storeIds': null,
        'permissions': {
          'sales': {'read': false, 'write': false},
          'stock-items': {'read': true, 'write': false},
          'transactions': {'read': true, 'write': true},
          'payments': {'read': true, 'write': false},
        },
      };
    default:
      return {'isAdmin': false, 'roles': [], 'employee': null, 'storeIds': [], 'permissions': {}};
  }
}

class _Server {
  _Server({this.role = 'cashier', this.loginStatus = 200});

  final String role;
  final int loginStatus;
  final List<String> calls = [];
  final List<Map<String, dynamic>> saleBodies = [];

  MockClient client() => MockClient((request) async {
        final path = request.url.path.replaceFirst('/api', '');
        calls.add('${request.method} $path');
        switch ('${request.method} $path') {
          case 'POST /auth/login':
            return loginStatus == 200 ? _json({'accessToken': 'a', 'refreshToken': 'r'}) : _json({'message': 'Invalid credentials'}, loginStatus);
          case 'POST /auth/logout':
            return _json({'message': 'ok'});
          case 'GET /users/me':
            return _json({'id': 9, 'username': 'cashier-llw', 'email': 'c@x.test'});
          case 'GET /users/me/tenants':
            return _json({
              'data': [
                {'id': 1, 'name': 'Northstar Market Co.'}
              ]
            });
          case 'GET /access':
            return _json(_access(role));
          case 'GET /stores':
            return _json(_page([
              {'id': 1, 'name': 'Area 3 Store', 'store_code': 'LLW-001'}
            ]));
          case 'GET /products':
            return _json(_page([
              {'id': 1, 'name': 'Everyday Tote', 'price': '18000.00'},
              {'id': 2, 'name': 'Field Notes Set', 'price': '9500.00'},
            ]));
          case 'GET /stock-items':
            return _json(_page([
              {'product_id': 1, 'store_id': 1, 'quantity': 3},
              {'product_id': 2, 'store_id': 1, 'quantity': 0},
            ]));
          case 'GET /transactions':
            return _json(_page([
              {'id': 1, 'transaction_type': 'income', 'category': 'Sales', 'amount': '50000.00', 'status': 'posted', 'occurred_at': '2026-11-10T08:00:00Z'},
              {'id': 2, 'transaction_type': 'expense', 'category': 'Rent', 'amount': '20000.00', 'status': 'posted', 'occurred_at': '2026-11-10T09:00:00Z'},
            ]));
          case 'GET /payments':
            return _json(_page([]));
          case 'POST /sales':
            saleBodies.add(jsonDecode(request.body) as Map<String, dynamic>);
            return _json({'id': 5}, 201);
        }
        return _json({'message': 'Unmocked ${request.method} $path'}, 404);
      });
}

Future<SessionController> _boot(WidgetTester tester, _Server server, {bool signedIn = false}) async {
  final store = MemoryKeyValueStore();
  if (signedIn) {
    store.values['access_token'] = 'a';
    store.values['refresh_token'] = 'r';
  }
  final api = ApiClient(store: store, baseUrl: 'http://test/api', client: server.client());
  final session = SessionController(api);
  await tester.pumpWidget(MarketMeshApp(session: session));
  await session.start();
  await tester.pumpAndSettle();
  return session;
}

Future<void> _signIn(WidgetTester tester) async {
  await tester.enterText(find.widgetWithText(TextFormField, 'Username or email'), 'cashier-llw');
  await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'Employee!2026');
  await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('shows the sign-in screen and validates empty fields', (tester) async {
    await _boot(tester, _Server());
    expect(find.text('Sign in with your employee login to start work.'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Enter your username or email'), findsOneWidget);
    expect(find.text('Enter your password'), findsOneWidget);
  });

  testWidgets('bad credentials show the server message and stay on sign-in', (tester) async {
    await _boot(tester, _Server(loginStatus: 401));
    await _signIn(tester);
    expect(find.text('Invalid credentials'), findsOneWidget);
    expect(find.text('Point of sale'), findsNothing);
  });

  testWidgets('a cashier lands on the POS and only gets the tabs their role allows', (tester) async {
    await _boot(tester, _Server());
    await _signIn(tester);
    expect(find.text('Point of sale'), findsOneWidget);
    expect(find.text('Sell'), findsOneWidget);
    expect(find.text('Stock'), findsOneWidget);
    expect(find.text('Accounts'), findsNothing);
    expect(find.text('Me'), findsOneWidget);
    expect(find.text('Everyday Tote'), findsOneWidget);
    expect(find.textContaining('MK 18,000.00'), findsOneWidget);
    expect(find.textContaining('Out of stock'), findsOneWidget);
    expect(find.textContaining('undefined'), findsNothing);
  });

  testWidgets('a cashier can ring up a sale and the request carries items and payment', (tester) async {
    final server = _Server();
    await _boot(tester, server);
    await _signIn(tester);

    await tester.tap(find.byTooltip('Add Everyday Tote'));
    await tester.pump();
    await tester.tap(find.byTooltip('Add one Everyday Tote'));
    await tester.pump();
    expect(find.textContaining('2 items'), findsOneWidget);
    expect(find.textContaining('Review · MK 36,000.00'), findsOneWidget);

    await tester.tap(find.textContaining('Review ·'));
    await tester.pumpAndSettle();
    expect(find.text('Review sale'), findsOneWidget);
    await tester.tap(find.textContaining('Take MK 36,000.00'));
    await tester.pumpAndSettle();

    expect(find.text('Sale recorded'), findsOneWidget);
    expect(server.saleBodies, hasLength(1));
    final sale = server.saleBodies.single;
    expect(sale['store_id'], 1);
    expect(sale['items'], [
      {'product_id': 1, 'quantity': 2}
    ]);
    expect((sale['payments'] as List).single['amount'], '36000.00');
    expect((sale['receipt_number'] as String).startsWith('R-'), isTrue);
  });

  testWidgets('cannot add more than the stock on hand', (tester) async {
    await _boot(tester, _Server());
    await _signIn(tester);
    for (var i = 0; i < 3; i++) {
      await tester.tap(find.byTooltip(i == 0 ? 'Add Everyday Tote' : 'Add one Everyday Tote'));
      await tester.pump();
    }
    // 3 in stock: the plus button is now disabled.
    final plus = tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.add_circle_outline));
    expect(plus.onPressed, isNull);
  });

  testWidgets('an accountant sees accounts with income, expenses and net, but no POS', (tester) async {
    await _boot(tester, _Server(role: 'accountant'));
    await _signIn(tester);
    expect(find.text('Sell'), findsNothing);
    await tester.tap(find.text('Accounts'));
    await tester.pumpAndSettle();
    expect(find.text('Cash book'), findsOneWidget);
    expect(find.text('MK 50,000.00'), findsWidgets);
    expect(find.text('MK 20,000.00'), findsWidgets);
    expect(find.text('MK 30,000.00'), findsOneWidget);
    expect(find.text('Record'), findsOneWidget);
  });

  testWidgets('a login with no role sees a clear message instead of an empty app', (tester) async {
    await _boot(tester, _Server(role: 'none'));
    await _signIn(tester);
    expect(find.textContaining('No role has been assigned'), findsOneWidget);
  });

  testWidgets('restores a saved session at launch and signs out cleanly', (tester) async {
    final server = _Server();
    await _boot(tester, server, signedIn: true);
    expect(find.text('Point of sale'), findsOneWidget);
    await tester.tap(find.text('Me'));
    await tester.pumpAndSettle();
    expect(find.text('Mphatso Phiri'), findsOneWidget);
    expect(find.text('Cashier'), findsWidgets);
    await tester.scrollUntilVisible(find.widgetWithText(FilledButton, 'Sign out'), 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.widgetWithText(FilledButton, 'Sign out'));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(of: find.byType(AlertDialog), matching: find.text('Sign out')));
    await tester.pumpAndSettle();
    expect(find.text('Sign in with your employee login to start work.'), findsOneWidget);
    expect(server.calls, contains('POST /auth/logout'));
  });
}

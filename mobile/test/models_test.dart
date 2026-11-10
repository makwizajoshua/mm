import 'package:flutter_test/flutter_test.dart';
import 'package:marketmesh_mobile/core/api_client.dart';
import 'package:marketmesh_mobile/core/models.dart';

void main() {
  group('money and text', () {
    test('formats Malawi Kwacha with thousands separators', () {
      expect(formatMoney('18000.00'), 'MK 18,000.00');
      expect(formatMoney(9500.5), 'MK 9,500.50');
      expect(formatMoney(null), 'MK 0.00');
      expect(formatMoney('abc'), 'MK 0.00');
    });

    test('title-cases snake_case', () {
      expect(titleCase('stock_clerk'), 'Stock Clerk');
      expect(titleCase('airtel_money'), 'Airtel Money');
    });

    test('never prints "undefined" or null text for missing values', () {
      expect(formatMoney(null), isNot(contains('null')));
      expect(formatDateTime(null), '');
    });
  });

  group('Cart', () {
    final tea = Product(1, 'Tea', 2500);
    final mug = Product(2, 'Mug', 24000.5);

    test('adds, totals and removes lines', () {
      final cart = Cart();
      expect(cart.isEmpty, isTrue);
      expect(cart.add(tea, available: 10), isTrue);
      expect(cart.add(tea, available: 10), isTrue);
      expect(cart.add(mug, available: 1), isTrue);
      expect(cart.itemCount, 3);
      expect(cart.total, 29000.5);
      cart.remove(tea);
      expect(cart.quantityOf(tea), 1);
      cart.remove(tea);
      expect(cart.quantityOf(tea), 0);
      expect(cart.lines.length, 1);
    });

    test('refuses to sell more than is in stock', () {
      final cart = Cart();
      expect(cart.add(mug, available: 1), isTrue);
      expect(cart.add(mug, available: 1), isFalse);
      expect(cart.add(tea, available: 0), isFalse);
      expect(cart.quantityOf(mug), 1);
    });

    test('builds the sale request the API expects', () {
      final cart = Cart()
        ..add(tea, available: 5)
        ..add(tea, available: 5);
      final body = cart.saleBody(storeId: 3, receipt: 'R-1', method: 'airtel_money', reference: 'AM123');
      expect(body['store_id'], 3);
      expect(body['receipt_number'], 'R-1');
      expect(body['items'], [
        {'product_id': 1, 'quantity': 2}
      ]);
      expect(body['payments'], [
        {'amount': '5000.00', 'method': 'airtel_money', 'reference': 'AM123'}
      ]);
    });

    test('omits an empty payment reference', () {
      final cart = Cart()..add(tea, available: 5);
      final body = cart.saleBody(storeId: 1, receipt: 'R-2', method: 'cash', reference: '');
      expect((body['payments'] as List).first.containsKey('reference'), isFalse);
    });
  });

  group('Access', () {
    final json = {
      'isAdmin': false,
      'roles': ['cashier'],
      'employee': {'id': 2, 'firstName': 'Mphatso', 'lastName': 'Phiri', 'employeeNumber': 'EMP-002'},
      'storeIds': [1],
      'permissions': {
        'sales': {'read': false, 'write': true},
        'transactions': {'read': false, 'write': false},
      },
    };

    test('parses the permission matrix', () {
      final access = Access.fromJson(json);
      expect(access.canWrite('sales'), isTrue);
      expect(access.canRead('transactions'), isFalse);
      expect(access.canRead('unknown-resource'), isFalse);
      expect(access.employee!.fullName, 'Mphatso Phiri');
      expect(access.roleLabel, 'Cashier');
      expect(access.storeIds, [1]);
    });

    test('owners are labelled and have no store limit', () {
      final access = Access.fromJson({'isAdmin': true, 'roles': [], 'employee': null, 'storeIds': null, 'permissions': <String, dynamic>{}});
      expect(access.roleLabel, 'Owner');
      expect(access.storeIds, isNull);
    });
  });

  group('finance summary', () {
    FinanceEntry entry(String type, num amount, [String status = 'posted']) =>
        FinanceEntry(id: 1, type: type, category: 'x', amount: amount, status: status);

    test('counts posted income and expenses only', () {
      final summary = FinanceSummary.of([entry('income', 100000), entry('expense', 30000), entry('expense', 5000, 'voided'), entry('transfer', 999)]);
      expect(summary.income, 100000);
      expect(summary.expense, 30000);
      expect(summary.net, 70000);
    });
  });

  group('stock actions', () {
    test('cover counting, receiving, damage and returns', () {
      expect(stockActions.map((a) => a.movementType), ['adjustment', 'purchase', 'damage', 'return']);
      expect(stockActions.first.sign, 0);
    });
  });

  group('normalizeBaseUrl', () {
    test('adds scheme and /api', () {
      expect(normalizeBaseUrl('shop.example.com'), 'https://shop.example.com/api');
      expect(normalizeBaseUrl('http://10.0.0.5:3000/'), 'http://10.0.0.5:3000/api');
      expect(normalizeBaseUrl('https://x.test/api'), 'https://x.test/api');
      expect(normalizeBaseUrl('  '), '');
    });
  });
}

import 'package:intl/intl.dart';

num toNum(dynamic value) => value is num ? value : num.tryParse('${value ?? ''}') ?? 0;

/// All amounts in MarketMesh are Malawi Kwacha.
final NumberFormat _kwacha = NumberFormat('#,##0.00');
String formatMoney(dynamic value) => 'MK ${_kwacha.format(toNum(value))}';

String formatDateTime(dynamic value) {
  final parsed = DateTime.tryParse('${value ?? ''}');
  if (parsed == null) return '';
  return DateFormat('d MMM y, HH:mm').format(parsed.toLocal());
}

String titleCase(String value) =>
    value.replaceAll('_', ' ').split(' ').where((w) => w.isNotEmpty).map((w) => '${w[0].toUpperCase()}${w.substring(1)}').join(' ');

class Company {
  Company(this.id, this.name);

  factory Company.fromJson(Map<String, dynamic> json) => Company((json['id'] as num).toInt(), json['name'] as String);

  final int id;
  final String name;
}

class EmployeeInfo {
  EmployeeInfo(this.id, this.firstName, this.lastName, this.employeeNumber);

  factory EmployeeInfo.fromJson(Map<String, dynamic> json) => EmployeeInfo(
        (json['id'] as num).toInt(),
        json['firstName'] as String,
        json['lastName'] as String,
        json['employeeNumber'] as String,
      );

  final int id;
  final String firstName;
  final String lastName;
  final String employeeNumber;

  String get fullName => '$firstName $lastName';
}

/// What the signed-in user may do in the active company (from GET /access).
class Access {
  Access({
    required this.isAdmin,
    required this.roles,
    required this.employee,
    required this.storeIds,
    required this.permissions,
  });

  factory Access.fromJson(Map<String, dynamic> json) {
    final permissions = <String, ({bool read, bool write})>{};
    (json['permissions'] as Map<String, dynamic>).forEach((key, value) {
      final rule = value as Map<String, dynamic>;
      permissions[key] = (read: rule['read'] == true, write: rule['write'] == true);
    });
    return Access(
      isAdmin: json['isAdmin'] == true,
      roles: (json['roles'] as List).cast<String>(),
      employee: json['employee'] == null ? null : EmployeeInfo.fromJson(json['employee'] as Map<String, dynamic>),
      storeIds: json['storeIds'] == null ? null : (json['storeIds'] as List).map((e) => (e as num).toInt()).toList(),
      permissions: permissions,
    );
  }

  final bool isAdmin;
  final List<String> roles;
  final EmployeeInfo? employee;

  /// Null means every store in the company.
  final List<int>? storeIds;
  final Map<String, ({bool read, bool write})> permissions;

  bool canRead(String resource) => permissions[resource]?.read ?? false;
  bool canWrite(String resource) => permissions[resource]?.write ?? false;

  String get roleLabel => isAdmin ? 'Owner' : roles.map(titleCase).join(', ');
}

class Product {
  Product(this.id, this.name, this.price);

  factory Product.fromJson(Map<String, dynamic> json) => Product((json['id'] as num).toInt(), json['name'] as String, toNum(json['price']));

  final int id;
  final String name;
  final num price;
}

class Store {
  Store(this.id, this.name, this.code);

  factory Store.fromJson(Map<String, dynamic> json) => Store((json['id'] as num).toInt(), json['name'] as String, '${json['store_code'] ?? ''}');

  final int id;
  final String name;
  final String code;
}

class FinanceEntry {
  FinanceEntry({required this.id, required this.type, required this.category, required this.amount, required this.status, this.description, this.occurredAt});

  factory FinanceEntry.fromJson(Map<String, dynamic> json) => FinanceEntry(
        id: (json['id'] as num).toInt(),
        type: '${json['transaction_type']}',
        category: '${json['category']}',
        amount: toNum(json['amount']),
        status: '${json['status']}',
        description: json['description'] as String?,
        occurredAt: json['occurred_at'],
      );

  final int id;
  final String type;
  final String category;
  final num amount;
  final String status;
  final String? description;
  final dynamic occurredAt;

  bool get isIncome => type == 'income';
}

class FinanceSummary {
  FinanceSummary(this.income, this.expense);

  /// Posted entries only; voided and pending ones do not count.
  factory FinanceSummary.of(Iterable<FinanceEntry> entries) {
    num income = 0;
    num expense = 0;
    for (final entry in entries.where((e) => e.status == 'posted')) {
      if (entry.type == 'income') income += entry.amount;
      if (entry.type == 'expense') expense += entry.amount;
    }
    return FinanceSummary(income, expense);
  }

  final num income;
  final num expense;
  num get net => income - expense;
}

class SaleOrder {
  SaleOrder({required this.id, required this.receipt, required this.total, required this.status, this.soldAt});

  factory SaleOrder.fromJson(Map<String, dynamic> json) => SaleOrder(
        id: (json['id'] as num).toInt(),
        receipt: '${json['receipt_number']}',
        total: toNum(json['total']),
        status: '${json['status']}',
        soldAt: json['sold_at'],
      );

  final int id;
  final String receipt;
  final num total;
  final String status;
  final dynamic soldAt;
}

class CartLine {
  CartLine(this.product, this.quantity);

  final Product product;
  int quantity;

  num get lineTotal => product.price * quantity;
}

/// The point-of-sale basket. Quantities are capped by what is in stock.
class Cart {
  final Map<int, CartLine> _lines = {};

  List<CartLine> get lines => _lines.values.toList();
  bool get isEmpty => _lines.isEmpty;
  int get itemCount => _lines.values.fold(0, (sum, line) => sum + line.quantity);
  num get total => _lines.values.fold<num>(0, (sum, line) => sum + line.lineTotal);

  int quantityOf(Product product) => _lines[product.id]?.quantity ?? 0;

  /// Returns false when adding would exceed [available] stock.
  bool add(Product product, {required int available}) {
    final current = quantityOf(product);
    if (current + 1 > available) return false;
    _lines.putIfAbsent(product.id, () => CartLine(product, 0)).quantity = current + 1;
    return true;
  }

  void remove(Product product) {
    final line = _lines[product.id];
    if (line == null) return;
    if (line.quantity <= 1) {
      _lines.remove(product.id);
    } else {
      line.quantity -= 1;
    }
  }

  void clear() => _lines.clear();

  Map<String, dynamic> saleBody({required int storeId, required String receipt, required String method, String? reference}) => {
        'store_id': storeId,
        'receipt_number': receipt,
        'items': lines.map((line) => {'product_id': line.product.id, 'quantity': line.quantity}).toList(),
        'payments': [
          {'amount': total.toStringAsFixed(2), 'method': method, if (reference != null && reference.isNotEmpty) 'reference': reference},
        ],
      };
}

const paymentMethods = <String, String>{
  'cash': 'Cash',
  'airtel_money': 'Airtel Money',
  'tnm_mpamba': 'TNM Mpamba',
  'card': 'Card',
  'bank_transfer': 'Bank transfer',
};

/// How a stock-taker's action turns into a stock movement.
class StockAction {
  const StockAction(this.label, this.movementType, this.sign);

  final String label;
  final String movementType;

  /// +1 adds stock, -1 removes it, 0 means the user enters a counted total.
  final int sign;
}

const stockActions = <StockAction>[
  StockAction('Stock count', 'adjustment', 0),
  StockAction('Receive stock', 'purchase', 1),
  StockAction('Damaged / lost', 'damage', -1),
  StockAction('Customer return', 'return', 1),
];

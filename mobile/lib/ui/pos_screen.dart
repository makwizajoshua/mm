import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import 'widgets.dart';

/// Point of sale: pick products, take payment, record the sale.
class PosScreen extends StatefulWidget {
  const PosScreen({super.key, required this.api, required this.access});

  final ApiClient api;
  final Access access;

  @override
  State<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends State<PosScreen> {
  final _cart = Cart();
  final _search = TextEditingController();
  List<Store> _stores = [];
  List<Product> _products = [];
  Map<int, int> _stock = {};
  int? _storeId;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final stores = (await widget.api.fetchAll('stores')).map(Store.fromJson).toList();
      if (stores.isEmpty) {
        throw ApiException('You are not assigned to a store yet. Ask your manager to assign you one.', 403);
      }
      final storeId = stores.any((s) => s.id == _storeId) ? _storeId! : stores.first.id;
      final products = (await widget.api.fetchAll('products')).map(Product.fromJson).toList()..sort((a, b) => a.name.compareTo(b.name));
      final stock = await _loadStock(storeId);
      if (!mounted) return;
      setState(() {
        _stores = stores;
        _storeId = storeId;
        _products = products;
        _stock = stock;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.message;
          _loading = false;
        });
      }
    }
  }

  Future<Map<int, int>> _loadStock(int storeId) async {
    final rows = await widget.api.fetchAll('stock-items', query: {'store_id': '$storeId'});
    return {for (final row in rows) (row['product_id'] as num).toInt(): toNum(row['quantity']).toInt()};
  }

  Future<void> _switchStore(int storeId) async {
    if (!_cart.isEmpty) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Change store?'),
          content: const Text('The current basket will be cleared.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep basket')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Change store')),
          ],
        ),
      );
      if (ok != true) return;
    }
    _cart.clear();
    setState(() {
      _storeId = storeId;
      _loading = true;
    });
    try {
      final stock = await _loadStock(storeId);
      if (mounted) setState(() => _stock = stock);
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message, error: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  int _available(Product product) => _stock[product.id] ?? 0;

  void _add(Product product) {
    final ok = _cart.add(product, available: _available(product));
    if (!ok) showMessage(context, 'Only ${_available(product)} of ${product.name} in stock.', error: true);
    setState(() {});
  }

  Future<void> _checkout() async {
    final done = await showModalBottomSheet<_SaleResult>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _CheckoutSheet(api: widget.api, cart: _cart, storeId: _storeId!, employeeId: widget.access.employee?.id ?? 0),
    );
    if (done == null || !mounted) {
      setState(() {});
      return;
    }
    _cart.clear();
    setState(() => _loading = true);
    try {
      _stock = await _loadStock(_storeId!);
    } on ApiException {
      // Stock refreshes again on the next pull-to-refresh.
    }
    if (!mounted) return;
    setState(() => _loading = false);
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        icon: Icon(Icons.check_circle, color: Theme.of(context).colorScheme.primary, size: 48),
        title: const Text('Sale recorded'),
        content: Text('Receipt ${done.receipt}\n${formatMoney(done.total)} · ${paymentMethods[done.method] ?? done.method}', textAlign: TextAlign.center),
        actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('New sale'))],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final query = _search.text.trim().toLowerCase();
    final visible = _products.where((p) => query.isEmpty || p.name.toLowerCase().contains(query)).toList();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Point of sale'),
        actions: [
          IconButton(
            tooltip: 'Recent sales',
            icon: const Icon(Icons.receipt_long),
            onPressed: _storeId == null ? null : () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => RecentSalesScreen(api: widget.api, storeId: _storeId!))),
          ),
        ],
      ),
      body: _error != null
          ? ErrorRetry(message: _error!, onRetry: _load)
          : Column(children: [
              StorePicker(stores: _stores, value: _storeId, onChanged: _switchStore),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: TextField(
                  controller: _search,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: 'Search products',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: query.isEmpty ? null : IconButton(icon: const Icon(Icons.clear), onPressed: () => setState(_search.clear)),
                  ),
                ),
              ),
              if (_loading) const LinearProgressIndicator(),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: _load,
                  child: visible.isEmpty && !_loading
                      ? ListView(children: [EmptyNote(query.isEmpty ? 'No products yet.' : 'No product matches "$query".')])
                      : ListView.separated(
                          itemCount: visible.length,
                          separatorBuilder: (_, _) => const Divider(height: 1),
                          itemBuilder: (context, index) => _ProductTile(
                            product: visible[index],
                            available: _available(visible[index]),
                            quantity: _cart.quantityOf(visible[index]),
                            onAdd: () => _add(visible[index]),
                            onRemove: () => setState(() => _cart.remove(visible[index])),
                          ),
                        ),
                ),
              ),
            ]),
      bottomNavigationBar: _cart.isEmpty
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: FilledButton(
                  onPressed: _checkout,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                      Text('${_cart.itemCount} item${_cart.itemCount == 1 ? '' : 's'}'),
                      Text('Review · ${formatMoney(_cart.total)}'),
                    ]),
                  ),
                ),
              ),
            ),
    );
  }
}

class _ProductTile extends StatelessWidget {
  const _ProductTile({required this.product, required this.available, required this.quantity, required this.onAdd, required this.onRemove});

  final Product product;
  final int available;
  final int quantity;
  final VoidCallback onAdd;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final out = available <= 0;
    return ListTile(
      enabled: !out || quantity > 0,
      title: Text(product.name),
      subtitle: Text(
        '${formatMoney(product.price)} · ${out ? 'Out of stock' : '$available in stock'}',
        style: TextStyle(color: out ? scheme.error : null),
      ),
      trailing: quantity == 0
          ? IconButton.filledTonal(tooltip: 'Add ${product.name}', icon: const Icon(Icons.add), onPressed: out ? null : onAdd)
          : Row(mainAxisSize: MainAxisSize.min, children: [
              IconButton(tooltip: 'Remove one ${product.name}', icon: const Icon(Icons.remove_circle_outline), onPressed: onRemove),
              Text('$quantity', style: Theme.of(context).textTheme.titleMedium),
              IconButton(tooltip: 'Add one ${product.name}', icon: const Icon(Icons.add_circle_outline), onPressed: quantity >= available ? null : onAdd),
            ]),
    );
  }
}

class _SaleResult {
  _SaleResult(this.receipt, this.total, this.method);

  final String receipt;
  final num total;
  final String method;
}

class _CheckoutSheet extends StatefulWidget {
  const _CheckoutSheet({required this.api, required this.cart, required this.storeId, required this.employeeId});

  final ApiClient api;
  final Cart cart;
  final int storeId;
  final int employeeId;

  @override
  State<_CheckoutSheet> createState() => _CheckoutSheetState();
}

class _CheckoutSheetState extends State<_CheckoutSheet> {
  final _reference = TextEditingController();
  String _method = 'cash';
  bool _busy = false;
  String? _error;
  late String _receipt = _newReceipt();

  String _newReceipt() => 'R-${DateFormat('yyMMddHHmmss').format(DateTime.now())}-${widget.employeeId}';

  @override
  void dispose() {
    _reference.dispose();
    super.dispose();
  }

  Future<void> _complete() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final total = widget.cart.total;
    try {
      await widget.api.request('POST', '/sales', body: widget.cart.saleBody(storeId: widget.storeId, receipt: _receipt, method: _method, reference: _reference.text.trim()));
      if (mounted) Navigator.pop(context, _SaleResult(_receipt, total, _method));
    } on ApiException catch (error) {
      // A repeated receipt number means a retry raced a slow response; use a fresh one next time.
      if (error.status == 409) _receipt = _newReceipt();
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final lines = widget.cart.lines;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          Text('Review sale', style: Theme.of(context).textTheme.titleLarge),
          Text('Receipt $_receipt', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 8),
          for (final line in lines)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: Text(line.product.name),
              subtitle: Text('${line.quantity} × ${formatMoney(line.product.price)}'),
              trailing: Text(formatMoney(line.lineTotal)),
            ),
          const Divider(),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text('Total', style: Theme.of(context).textTheme.titleMedium),
            Text(formatMoney(widget.cart.total), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          ]),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _method,
            decoration: const InputDecoration(labelText: 'Payment method'),
            items: [for (final entry in paymentMethods.entries) DropdownMenuItem(value: entry.key, child: Text(entry.value))],
            onChanged: _busy ? null : (value) => setState(() => _method = value ?? 'cash'),
          ),
          if (_method != 'cash') ...[
            const SizedBox(height: 12),
            TextField(
              controller: _reference,
              enabled: !_busy,
              maxLength: 120,
              decoration: InputDecoration(labelText: _method == 'card' ? 'Card slip number' : 'Transaction reference'),
            ),
          ],
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error), semanticsLabel: 'Error: $_error'),
            ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _complete,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text('Take ${formatMoney(widget.cart.total)}'),
            ),
          ),
        ]),
      ),
    );
  }
}

class RecentSalesScreen extends StatefulWidget {
  const RecentSalesScreen({super.key, required this.api, required this.storeId});

  final ApiClient api;
  final int storeId;

  @override
  State<RecentSalesScreen> createState() => _RecentSalesScreenState();
}

class _RecentSalesScreenState extends State<RecentSalesScreen> {
  List<SaleOrder>? _orders;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final result = await widget.api.getMap('/orders', query: {'store_id': '${widget.storeId}', 'limit': '50', 'sort': 'sold_at', 'order': 'desc'});
      final orders = (result['data'] as List).map((e) => SaleOrder.fromJson(e as Map<String, dynamic>)).toList();
      if (mounted) setState(() => _orders = orders);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Recent sales')),
        body: _error != null
            ? ErrorRetry(message: _error!, onRetry: _load)
            : _orders == null
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: _load,
                    child: _orders!.isEmpty
                        ? ListView(children: const [EmptyNote('No sales recorded yet.', icon: Icons.receipt_long)])
                        : ListView.separated(
                            itemCount: _orders!.length,
                            separatorBuilder: (_, _) => const Divider(height: 1),
                            itemBuilder: (context, index) {
                              final order = _orders![index];
                              return ListTile(
                                title: Text(order.receipt),
                                subtitle: Text('${formatDateTime(order.soldAt)} · ${titleCase(order.status)}'),
                                trailing: Text(formatMoney(order.total), style: const TextStyle(fontWeight: FontWeight.w700)),
                              );
                            },
                          ),
                  ),
      );
}

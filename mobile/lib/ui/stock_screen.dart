import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import 'widgets.dart';

const int kLowStock = 5;

/// Stock list per store, with stock taking for roles that may adjust stock.
class StockScreen extends StatefulWidget {
  const StockScreen({super.key, required this.api, required this.access});

  final ApiClient api;
  final Access access;

  @override
  State<StockScreen> createState() => _StockScreenState();
}

class _StockScreenState extends State<StockScreen> {
  final _search = TextEditingController();
  List<Store> _stores = [];
  List<Product> _products = [];
  Map<int, int> _stock = {};
  int? _storeId;
  bool _loading = true;
  bool _lowOnly = false;
  String? _error;

  bool get _canAdjust => widget.access.canWrite('stock-adjustments');

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

  Future<Map<int, int>> _loadStock(int storeId) async {
    final rows = await widget.api.fetchAll('stock-items', query: {'store_id': '$storeId'});
    return {for (final row in rows) (row['product_id'] as num).toInt(): toNum(row['quantity']).toInt()};
  }

  Future<void> _load({int? storeId}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final stores = (await widget.api.fetchAll('stores')).map(Store.fromJson).toList();
      if (stores.isEmpty) throw ApiException('You are not assigned to a store yet. Ask your manager to assign you one.', 403);
      final chosen = storeId ?? (stores.any((s) => s.id == _storeId) ? _storeId! : stores.first.id);
      final products = (await widget.api.fetchAll('products')).map(Product.fromJson).toList()..sort((a, b) => a.name.compareTo(b.name));
      final stock = await _loadStock(chosen);
      if (!mounted) return;
      setState(() {
        _stores = stores;
        _storeId = chosen;
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

  Future<void> _adjust(Product product) async {
    final updated = await showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _StockSheet(api: widget.api, product: product, storeId: _storeId!, current: _stock[product.id] ?? 0),
    );
    if (updated != null && mounted) {
      setState(() => _stock = {..._stock, product.id: updated});
      showMessage(context, '${product.name} is now $updated in stock.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final query = _search.text.trim().toLowerCase();
    final visible = _products.where((p) {
      final quantity = _stock[p.id] ?? 0;
      return (query.isEmpty || p.name.toLowerCase().contains(query)) && (!_lowOnly || quantity <= kLowStock);
    }).toList();
    final lowCount = _products.where((p) => (_stock[p.id] ?? 0) <= kLowStock).length;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Stock'),
        actions: [
          IconButton(
            tooltip: 'Movement history',
            icon: const Icon(Icons.history),
            onPressed: _storeId == null || !widget.access.canRead('inventory-movements')
                ? null
                : () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => MovementsScreen(api: widget.api, storeId: _storeId!, products: _products))),
          ),
        ],
      ),
      body: _error != null
          ? ErrorRetry(message: _error!, onRetry: _load)
          : Column(children: [
              StorePicker(stores: _stores, value: _storeId, onChanged: (id) => _load(storeId: id)),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
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
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: FilterChip(
                    label: Text('Low or out of stock ($lowCount)'),
                    selected: _lowOnly,
                    onSelected: (value) => setState(() => _lowOnly = value),
                  ),
                ),
              ),
              if (_loading) const LinearProgressIndicator(),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () => _load(),
                  child: visible.isEmpty && !_loading
                      ? ListView(children: [EmptyNote(_lowOnly ? 'Nothing is running low.' : 'No products found.')])
                      : ListView.separated(
                          itemCount: visible.length,
                          separatorBuilder: (_, _) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final product = visible[index];
                            final quantity = _stock[product.id] ?? 0;
                            final scheme = Theme.of(context).colorScheme;
                            return ListTile(
                              title: Text(product.name),
                              subtitle: Text(formatMoney(product.price)),
                              trailing: Chip(
                                label: Text('$quantity'),
                                backgroundColor: quantity == 0 ? scheme.errorContainer : quantity <= kLowStock ? scheme.tertiaryContainer : null,
                              ),
                              onTap: _canAdjust ? () => _adjust(product) : null,
                            );
                          },
                        ),
                ),
              ),
            ]),
    );
  }
}

class _StockSheet extends StatefulWidget {
  const _StockSheet({required this.api, required this.product, required this.storeId, required this.current});

  final ApiClient api;
  final Product product;
  final int storeId;
  final int current;

  @override
  State<_StockSheet> createState() => _StockSheetState();
}

class _StockSheetState extends State<_StockSheet> {
  final _quantity = TextEditingController();
  final _note = TextEditingController();
  StockAction _action = stockActions.first;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _quantity.dispose();
    _note.dispose();
    super.dispose();
  }

  /// The signed stock change this entry represents, or null if the input is not valid.
  int? _delta() {
    final value = int.tryParse(_quantity.text.trim());
    if (value == null || value < 0) return null;
    return _action.sign == 0 ? value - widget.current : _action.sign * value;
  }

  Future<void> _save() async {
    final delta = _delta();
    if (delta == null) {
      setState(() => _error = 'Enter a whole number, zero or more.');
      return;
    }
    if (delta == 0) {
      setState(() => _error = _action.sign == 0 ? 'The count matches the system. Nothing to change.' : 'Enter a quantity above zero.');
      return;
    }
    if (widget.current + delta < 0) {
      setState(() => _error = 'That would take stock below zero.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await widget.api.request('POST', '/stock-adjustments', body: {
        'store_id': widget.storeId,
        'product_id': widget.product.id,
        'quantity_delta': delta,
        'movement_type': _action.movementType,
        if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
      }) as Map<String, dynamic>;
      if (mounted) Navigator.pop(context, (result['quantity'] as num).toInt());
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final delta = _delta();
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          Text(widget.product.name, style: Theme.of(context).textTheme.titleLarge),
          Text('System stock: ${widget.current}'),
          const SizedBox(height: 12),
          Wrap(spacing: 8, children: [
            for (final action in stockActions)
              ChoiceChip(
                label: Text(action.label),
                selected: _action == action,
                onSelected: _busy ? null : (_) => setState(() => _action = action),
              ),
          ]),
          const SizedBox(height: 12),
          TextField(
            controller: _quantity,
            enabled: !_busy,
            keyboardType: TextInputType.number,
            autofocus: true,
            onChanged: (_) => setState(() => _error = null),
            decoration: InputDecoration(
              labelText: _action.sign == 0 ? 'Quantity counted on the shelf' : 'Quantity',
              helperText: delta == null || delta == 0 ? null : 'Stock changes by ${delta > 0 ? '+' : ''}$delta to ${widget.current + delta}',
            ),
          ),
          const SizedBox(height: 12),
          TextField(controller: _note, enabled: !_busy, maxLength: 200, decoration: const InputDecoration(labelText: 'Note (optional)')),
          if (_error != null) Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error), semanticsLabel: 'Error: $_error'),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Save'),
            ),
          ),
        ]),
      ),
    );
  }
}

class MovementsScreen extends StatefulWidget {
  const MovementsScreen({super.key, required this.api, required this.storeId, required this.products});

  final ApiClient api;
  final int storeId;
  final List<Product> products;

  @override
  State<MovementsScreen> createState() => _MovementsScreenState();
}

class _MovementsScreenState extends State<MovementsScreen> {
  List<Map<String, dynamic>>? _rows;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final result = await widget.api.getMap('/inventory-movements', query: {'store_id': '${widget.storeId}', 'limit': '50', 'sort': 'occurred_at', 'order': 'desc'});
      final rows = (result['data'] as List).cast<Map<String, dynamic>>();
      if (mounted) setState(() => _rows = rows);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final names = {for (final p in widget.products) p.id: p.name};
    return Scaffold(
      appBar: AppBar(title: const Text('Stock movements')),
      body: _error != null
          ? ErrorRetry(message: _error!, onRetry: _load)
          : _rows == null
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _rows!.isEmpty
                      ? ListView(children: const [EmptyNote('No stock movements yet.')])
                      : ListView.separated(
                          itemCount: _rows!.length,
                          separatorBuilder: (_, _) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final row = _rows![index];
                            final delta = toNum(row['quantity_delta']).toInt();
                            return ListTile(
                              title: Text(names[(row['product_id'] as num).toInt()] ?? 'Product #${row['product_id']}'),
                              subtitle: Text('${titleCase('${row['movement_type']}')} · ${formatDateTime(row['occurred_at'])}${row['note'] == null ? '' : '\n${row['note']}'}'),
                              isThreeLine: row['note'] != null,
                              trailing: Text('${delta > 0 ? '+' : ''}$delta', style: TextStyle(fontWeight: FontWeight.w700, color: delta < 0 ? Theme.of(context).colorScheme.error : null)),
                            );
                          },
                        ),
                ),
    );
  }
}

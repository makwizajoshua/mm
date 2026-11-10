import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import 'widgets.dart';

const _categories = ['Rent', 'Transport', 'Salaries', 'Utilities', 'Supplies', 'Airtime & data', 'Bank charges', 'Other'];

/// Cash book (income and expenses) and the payments taken at the till.
class AccountingScreen extends StatelessWidget {
  const AccountingScreen({super.key, required this.api, required this.access});

  final ApiClient api;
  final Access access;

  @override
  Widget build(BuildContext context) {
    final showPayments = access.canRead('payments');
    return DefaultTabController(
      length: showPayments ? 2 : 1,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Accounts'),
          bottom: showPayments ? const TabBar(tabs: [Tab(text: 'Cash book'), Tab(text: 'Till payments')]) : null,
        ),
        body: TabBarView(children: [
          _CashBook(api: api, access: access),
          if (showPayments) _PaymentsList(api: api),
        ]),
      ),
    );
  }
}

class _CashBook extends StatefulWidget {
  const _CashBook({required this.api, required this.access});

  final ApiClient api;
  final Access access;

  @override
  State<_CashBook> createState() => _CashBookState();
}

class _CashBookState extends State<_CashBook> {
  List<FinanceEntry>? _entries;
  String? _error;

  bool get _canWrite => widget.access.canWrite('transactions');

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final result = await widget.api.getMap('/transactions', query: {'limit': '100', 'sort': 'occurred_at', 'order': 'desc'});
      final entries = (result['data'] as List).map((e) => FinanceEntry.fromJson(e as Map<String, dynamic>)).toList();
      if (mounted) setState(() => _entries = entries);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  Future<void> _add() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _EntrySheet(api: widget.api, employeeId: widget.access.employee?.id),
    );
    if (saved == true) {
      if (mounted) showMessage(context, 'Entry recorded.');
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final entries = _entries;
    return Scaffold(
      floatingActionButton: _canWrite ? FloatingActionButton.extended(onPressed: _add, icon: const Icon(Icons.add), label: const Text('Record')) : null,
      body: _error != null
          ? ErrorRetry(message: _error!, onRetry: _load)
          : entries == null
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(padding: const EdgeInsets.only(bottom: 88), children: [
                    _Summary(entries),
                    if (entries.isEmpty) const EmptyNote('No entries yet. Record income and expenses as they happen.', icon: Icons.account_balance_wallet_outlined),
                    for (final entry in entries) _EntryTile(entry),
                  ]),
                ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary(this.entries);

  final List<FinanceEntry> entries;

  @override
  Widget build(BuildContext context) {
    final summary = FinanceSummary.of(entries);
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          StatTile(label: 'Income', value: formatMoney(summary.income), color: scheme.primary),
          const SizedBox(width: 8),
          StatTile(label: 'Expenses', value: formatMoney(summary.expense), color: scheme.error),
        ]),
        const SizedBox(height: 8),
        Row(children: [StatTile(label: 'Net', value: formatMoney(summary.net))]),
        const SizedBox(height: 4),
        Text('Based on the latest ${entries.length} posted and pending entries.', style: Theme.of(context).textTheme.bodySmall),
      ]),
    );
  }
}

class _EntryTile extends StatelessWidget {
  const _EntryTile(this.entry);

  final FinanceEntry entry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final voided = entry.status == 'voided';
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: entry.isIncome ? scheme.primaryContainer : scheme.errorContainer,
        child: Icon(entry.isIncome ? Icons.south_west : Icons.north_east, size: 18),
      ),
      title: Text(entry.category, style: voided ? const TextStyle(decoration: TextDecoration.lineThrough) : null),
      subtitle: Text([formatDateTime(entry.occurredAt), if (entry.description != null && entry.description!.isNotEmpty) entry.description!, if (entry.status != 'posted') titleCase(entry.status)].join(' · ')),
      trailing: Text(
        '${entry.isIncome ? '+' : entry.type == 'expense' ? '−' : ''}${formatMoney(entry.amount)}',
        style: TextStyle(fontWeight: FontWeight.w700, color: entry.isIncome ? scheme.primary : null),
      ),
    );
  }
}

class _EntrySheet extends StatefulWidget {
  const _EntrySheet({required this.api, required this.employeeId});

  final ApiClient api;
  final int? employeeId;

  @override
  State<_EntrySheet> createState() => _EntrySheetState();
}

class _EntrySheetState extends State<_EntrySheet> {
  final _amount = TextEditingController();
  final _description = TextEditingController();
  String _type = 'expense';
  String _category = _categories.first;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final amount = num.tryParse(_amount.text.trim().replaceAll(',', ''));
    if (amount == null || amount <= 0) {
      setState(() => _error = 'Enter an amount greater than zero.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.request('POST', '/transactions', body: {
        'amount': amount.toStringAsFixed(2),
        'transaction_type': _type,
        'category': _category,
        if (_description.text.trim().isNotEmpty) 'description': _description.text.trim(),
        if (widget.employeeId != null) 'employee_id': widget.employeeId,
      });
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.of(context).viewInsets.bottom + 16),
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
            Text('Record an entry', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            SegmentedButton<String>(
              segments: const [ButtonSegment(value: 'expense', label: Text('Expense')), ButtonSegment(value: 'income', label: Text('Income'))],
              selected: {_type},
              onSelectionChanged: _busy ? null : (value) => setState(() => _type = value.first),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _amount,
              enabled: !_busy,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Amount', prefixText: 'MK '),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _category,
              decoration: const InputDecoration(labelText: 'Category'),
              items: [for (final category in _categories) DropdownMenuItem(value: category, child: Text(category))],
              onChanged: _busy ? null : (value) => setState(() => _category = value ?? _category),
            ),
            const SizedBox(height: 12),
            TextField(controller: _description, enabled: !_busy, maxLength: 200, decoration: const InputDecoration(labelText: 'Description (optional)')),
            if (_error != null) Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error), semanticsLabel: 'Error: $_error'),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Save entry'),
              ),
            ),
          ]),
        ),
      );
}

class _PaymentsList extends StatefulWidget {
  const _PaymentsList({required this.api});

  final ApiClient api;

  @override
  State<_PaymentsList> createState() => _PaymentsListState();
}

class _PaymentsListState extends State<_PaymentsList> {
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
      final result = await widget.api.getMap('/payments', query: {'limit': '100', 'sort': 'paid_at', 'order': 'desc'});
      final rows = (result['data'] as List).cast<Map<String, dynamic>>();
      if (mounted) setState(() => _rows = rows);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    if (_error != null) return ErrorRetry(message: _error!, onRetry: _load);
    if (rows == null) return const Center(child: CircularProgressIndicator());
    // Totals per payment method (cash, Airtel Money, TNM Mpamba...) for the loaded payments.
    final byMethod = <String, num>{};
    for (final row in rows.where((r) => r['status'] == 'completed')) {
      final method = '${row['method']}';
      byMethod[method] = (byMethod[method] ?? 0) + toNum(row['amount']);
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(children: [
        if (byMethod.isNotEmpty)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Wrap(spacing: 8, runSpacing: 8, children: [
              for (final entry in byMethod.entries) Chip(label: Text('${paymentMethods[entry.key] ?? titleCase(entry.key)}: ${formatMoney(entry.value)}')),
            ]),
          ),
        if (rows.isEmpty) const EmptyNote('No payments yet.', icon: Icons.payments_outlined),
        for (final row in rows)
          ListTile(
            title: Text(paymentMethods['${row['method']}'] ?? titleCase('${row['method']}')),
            subtitle: Text([formatDateTime(row['paid_at']), if (row['reference'] != null) '${row['reference']}', if (row['status'] != 'completed') titleCase('${row['status']}')].join(' · ')),
            trailing: Text(formatMoney(row['amount']), style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
      ]),
    );
  }
}

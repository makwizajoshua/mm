import 'package:flutter/material.dart';

import '../core/session.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key, required this.session});

  final SessionController session;

  Future<void> _confirmSignOut(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need your username and password to sign in again.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out')),
        ],
      ),
    );
    if (ok == true) await session.signOut();
  }

  @override
  Widget build(BuildContext context) {
    final access = session.access!;
    final employee = access.employee;
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('My account')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Row(children: [
          CircleAvatar(
            radius: 30,
            backgroundColor: scheme.primaryContainer,
            child: Text(session.displayName.isEmpty ? '?' : session.displayName[0].toUpperCase(), style: Theme.of(context).textTheme.headlineSmall),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(session.displayName, style: Theme.of(context).textTheme.titleLarge),
              Text('${session.user?['email'] ?? ''}'),
            ]),
          ),
        ]),
        const SizedBox(height: 24),
        Card(
          child: Column(children: [
            ListTile(leading: const Icon(Icons.business), title: const Text('Company'), subtitle: Text(session.company?.name ?? '')),
            const Divider(height: 1),
            ListTile(leading: const Icon(Icons.badge_outlined), title: const Text('Role'), subtitle: Text(access.roleLabel.isEmpty ? 'No role assigned' : access.roleLabel)),
            if (employee != null) ...[
              const Divider(height: 1),
              ListTile(leading: const Icon(Icons.numbers), title: const Text('Employee number'), subtitle: Text(employee.employeeNumber)),
            ],
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.storefront),
              title: const Text('Stores'),
              subtitle: Text(access.storeIds == null ? 'All stores' : '${access.storeIds!.length} assigned'),
            ),
          ]),
        ),
        const SizedBox(height: 16),
        Text('What you can do', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          if (access.canWrite('sales')) const Chip(avatar: Icon(Icons.point_of_sale, size: 18), label: Text('Make sales')),
          if (access.canWrite('stock-adjustments')) const Chip(avatar: Icon(Icons.inventory_2_outlined, size: 18), label: Text('Take stock')),
          if (access.canWrite('transactions')) const Chip(avatar: Icon(Icons.account_balance_wallet_outlined, size: 18), label: Text('Keep accounts')),
          if (access.canRead('stock-items') && !access.canWrite('stock-adjustments')) const Chip(label: Text('View stock')),
        ]),
        const SizedBox(height: 24),
        if (session.companies.length > 1)
          OutlinedButton.icon(onPressed: session.chooseAnotherCompany, icon: const Icon(Icons.swap_horiz), label: const Text('Switch company')),
        const SizedBox(height: 8),
        FilledButton.tonalIcon(onPressed: () => _confirmSignOut(context), icon: const Icon(Icons.logout), label: const Text('Sign out')),
        const SizedBox(height: 24),
        Center(child: Text('Server: ${session.api.baseUrl}', style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center)),
      ]),
    );
  }
}

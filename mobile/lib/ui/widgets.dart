import 'package:flutter/material.dart';

import '../core/models.dart';

const kBrand = Color(0xFF14532D);

ThemeData buildTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(seedColor: kBrand, brightness: brightness);
  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    visualDensity: VisualDensity.adaptivePlatformDensity,
    inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
    appBarTheme: const AppBarTheme(centerTitle: false),
    cardTheme: const CardThemeData(margin: EdgeInsets.zero),
  );
}

void showMessage(BuildContext context, String message, {bool error = false}) {
  final messenger = ScaffoldMessenger.of(context);
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(SnackBar(
    content: Text(message),
    behavior: SnackBarBehavior.floating,
    backgroundColor: error ? Theme.of(context).colorScheme.error : null,
  ));
}

class ErrorRetry extends StatelessWidget {
  const ErrorRetry({super.key, required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.cloud_off, size: 48, color: Theme.of(context).colorScheme.error),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.tonal(onPressed: onRetry, child: const Text('Try again')),
          ]),
        ),
      );
}

class EmptyNote extends StatelessWidget {
  const EmptyNote(this.message, {super.key, this.icon = Icons.inbox_outlined});

  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 48, color: Theme.of(context).colorScheme.outline),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ]),
        ),
      );
}

class StorePicker extends StatelessWidget {
  const StorePicker({super.key, required this.stores, required this.value, required this.onChanged});

  final List<Store> stores;
  final int? value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    if (stores.length <= 1) {
      return ListTile(
        dense: true,
        leading: const Icon(Icons.storefront),
        title: Text(stores.isEmpty ? 'No store' : stores.first.name),
      );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: DropdownButtonFormField<int>(
        initialValue: value,
        decoration: const InputDecoration(labelText: 'Store', prefixIcon: Icon(Icons.storefront)),
        items: [for (final store in stores) DropdownMenuItem(value: store.id, child: Text(store.name))],
        onChanged: (id) {
          if (id != null) onChanged(id);
        },
      ),
    );
  }
}

class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.label, required this.value, this.color});

  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: Theme.of(context).textTheme.labelMedium),
              const SizedBox(height: 4),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(value, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700, color: color)),
              ),
            ]),
          ),
        ),
      );
}

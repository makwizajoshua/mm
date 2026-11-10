import 'package:flutter/material.dart';

import '../core/session.dart';
import 'account_screen.dart';
import 'company_screen.dart';
import 'login_screen.dart';
import 'accounting_screen.dart';
import 'pos_screen.dart';
import 'stock_screen.dart';
import 'widgets.dart';

class _Tab {
  _Tab(this.label, this.icon, this.builder);

  final String label;
  final IconData icon;
  final Widget Function() builder;
}

/// Bottom navigation limited to the work this employee's role allows.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.session});

  final SessionController session;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  final Set<int> _visited = {0};

  List<_Tab> _tabs() {
    final access = widget.session.access!;
    final api = widget.session.api;
    return [
      if (access.canWrite('sales')) _Tab('Sell', Icons.point_of_sale, () => PosScreen(api: api, access: access)),
      if (access.canRead('stock-items')) _Tab('Stock', Icons.inventory_2_outlined, () => StockScreen(api: api, access: access)),
      if (access.canRead('transactions')) _Tab('Accounts', Icons.account_balance_wallet_outlined, () => AccountingScreen(api: api, access: access)),
      _Tab('Me', Icons.person_outline, () => AccountScreen(session: widget.session)),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final tabs = _tabs();
    final index = _index.clamp(0, tabs.length - 1);
    final access = widget.session.access!;
    return Scaffold(
      body: tabs.length == 1
          ? Column(children: [
              if (!access.isAdmin && access.roles.isEmpty)
                const MaterialBanner(
                  content: Text('No role has been assigned to your login yet. Ask the company owner to set up your access.'),
                  actions: [SizedBox.shrink()],
                ),
              Expanded(child: tabs.first.builder()),
            ])
          // Tabs load when first opened and then stay alive, so a half-finished sale survives switching tabs.
          : IndexedStack(index: index, children: [for (var i = 0; i < tabs.length; i++) _visited.contains(i) ? tabs[i].builder() : const SizedBox.shrink()]),
      bottomNavigationBar: tabs.length > 1
          ? NavigationBar(
              selectedIndex: index,
              onDestinationSelected: (value) => setState(() {
                _index = value;
                _visited.add(value);
              }),
              destinations: [for (final tab in tabs) NavigationDestination(icon: Icon(tab.icon), label: tab.label)],
            )
          : null,
    );
  }
}

/// Root widget: picks the screen for the current session phase.
class MarketMeshApp extends StatelessWidget {
  const MarketMeshApp({super.key, required this.session});

  final SessionController session;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'MarketMesh',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        home: ListenableBuilder(
          listenable: session,
          builder: (context, _) => switch (session.phase) {
            SessionPhase.starting => const Scaffold(body: Center(child: CircularProgressIndicator())),
            SessionPhase.signedOut => LoginScreen(session: session),
            SessionPhase.chooseCompany => CompanyScreen(session: session),
            SessionPhase.ready => HomeShell(key: ValueKey(session.company?.id), session: session),
          },
        ),
      );
}

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/login',
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const Scaffold(
          body: Center(child: Text('Login')),
        ),
      ),
      GoRoute(
        path: '/dashboard',
        builder: (context, state) => const Scaffold(
          body: Center(child: Text('Dashboard')),
        ),
      ),
      GoRoute(
        path: '/attendance',
        builder: (context, state) => const Scaffold(
          body: Center(child: Text('Attendance')),
        ),
      ),
      GoRoute(
        path: '/progress',
        builder: (context, state) => const Scaffold(
          body: Center(child: Text('Progress Updates')),
        ),
      ),
    ],
  );
});

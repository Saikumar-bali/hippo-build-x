import 'package:flutter/material.dart';

class AppTheme {
  static ThemeData get light {
    return ThemeData(
      useMaterial3: true,
      colorSchemeSeed: Colors.blue,
      brightness: Brightness.light,
    );
  }

  static ThemeData get dark {
    return ThemeData(
      useMaterial3: true,
      colorSchemeSeed: Colors.blue,
      brightness: Brightness.dark,
    );
  }
}

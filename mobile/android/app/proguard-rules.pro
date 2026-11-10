# Keep Flutter plugin entry points that R8 cannot see being used.
-keep class io.flutter.plugin.** { *; }
-dontwarn com.google.android.play.core.**

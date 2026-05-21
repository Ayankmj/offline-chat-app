# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /sdk/tools/proguard/proguard-android.txt

# Keep React Native modules
-keep class com.facebook.react.** { *; }
-keep class com.offlinechat.** { *; }

# Keep llama.rn native bindings
-keep class com.zoontek.rnlocalcli.** { *; }

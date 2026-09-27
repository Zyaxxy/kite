/** Metro chooses NativeNavigator.native.tsx for Android/iOS; web never loads native tab modules. */
export function NativeNavigator() {
  return null;
}

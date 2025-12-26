import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

export default function TabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf="shield.checkered" />
        <Label>VPN</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="parental">
        <Icon sf="figure.and.child.holdinghands" />
        <Label>Parental</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="adblock">
        <Icon sf="nosign" />
        <Label>Ad Block</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf="person.fill" />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

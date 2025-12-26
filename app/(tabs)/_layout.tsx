import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

export default function TabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf="shield.checkered" />
        <Label>VPN</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="adblock">
        <Icon sf="nosign" />
        <Label>Ad Block</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="status">
        <Icon sf="speedometer" />
        <Label>Speed Test</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf="person.fill" />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

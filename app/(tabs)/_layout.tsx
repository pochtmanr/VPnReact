import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf="shield.checkered" />
        <Label>{t('navigation.tabs.vpn')}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="filter">
        <Icon sf="line.3.horizontal.decrease" />
        <Label>{t('navigation.tabs.filter')}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="adblock">
        <Icon sf="nosign" />
        <Label>{t('navigation.tabs.adblock')}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf="person.fill" />
        <Label>{t('navigation.tabs.profile')}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

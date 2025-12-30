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
      <NativeTabs.Trigger name="parental">
        <Icon sf="figure.and.child.holdinghands" />
        <Label>{t('navigation.tabs.parental')}</Label>
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

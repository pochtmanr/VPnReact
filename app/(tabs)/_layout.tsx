import { NativeTabs, Icon, Label, VectorIcon } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '@/context/ThemeContext';

export default function TabLayout() {
  const { t } = useTranslation();
  const { isDark } = useTheme();

  // Grayscale-only tab bar colors
  const tabBarBg = isDark ? '#1C1C1E' : '#F2F2F7';
  const selectedColor = isDark ? '#FFFFFF' : '#000000';
  const unselectedColor = isDark ? '#8E8E93' : '#636366';
  const indicatorBg = isDark ? '#333333' : '#D1D1D6';

  return (
    <NativeTabs
      backgroundColor={tabBarBg}
      tintColor={selectedColor}
      labelStyle={{
        default: { color: unselectedColor },
        selected: { color: selectedColor },
      }}
      iconColor={{
        default: unselectedColor,
        selected: selectedColor,
      }}
      indicatorColor={indicatorBg}
      labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index">
        <Icon
          sf={{ default: 'shield', selected: 'shield.checkered' }}
          androidSrc={{
            default: <VectorIcon family={MaterialCommunityIcons} name="shield-outline" />,
            selected: <VectorIcon family={MaterialCommunityIcons} name="shield-check" />,
          }}
        />
        <Label>{t('navigation.tabs.vpn')}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="filter">
        <Icon
          sf={{ default: 'line.3.horizontal.decrease', selected: 'line.3.horizontal.decrease.circle.fill' }}
          androidSrc={{
            default: <VectorIcon family={MaterialCommunityIcons} name="filter-outline" />,
            selected: <VectorIcon family={MaterialCommunityIcons} name="filter" />,
          }}
        />
        <Label>{t('navigation.tabs.filter')}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="adblock">
        <Icon
          sf={{ default: 'hand.raised', selected: 'hand.raised.fill' }}
          androidSrc={{
            default: <VectorIcon family={MaterialCommunityIcons} name="shield-off-outline" />,
            selected: <VectorIcon family={MaterialCommunityIcons} name="shield-off" />,
          }}
        />
        <Label>{t('navigation.tabs.adblock')}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon
          sf={{ default: 'person', selected: 'person.fill' }}
          androidSrc={{
            default: <VectorIcon family={MaterialCommunityIcons} name="account-outline" />,
            selected: <VectorIcon family={MaterialCommunityIcons} name="account" />,
          }}
        />
        <Label>{t('navigation.tabs.profile')}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

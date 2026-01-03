import { NativeTabs, Icon, Label, VectorIcon } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '@/context/ThemeContext';

export default function TabLayout() {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();

  // Android-specific styling for Material Design compliance
  const androidTabBarProps = Platform.OS === 'android' ? {
    // Material Design 3 bottom navigation styling
    rippleColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)',
    indicatorColor: colors.primary,
    labelVisibilityMode: 'labeled' as const,
    // Ensure proper background colors
    backgroundColor: isDark ? '#1C1B1F' : '#FFFBFE',
    // Icon colors: default is muted, selected is WHITE (to contrast with blue indicator)
    iconColor: {
      default: isDark ? '#CAC4D0' : '#49454F',
      selected: '#FFFFFF', // White icon on blue indicator
    },
    labelStyle: {
      default: {
        color: isDark ? '#CAC4D0' : '#49454F',
        fontSize: 12,
        fontWeight: '500' as const,
      },
      selected: {
        color: colors.primary,
        fontSize: 12,
        fontWeight: '600' as const,
      },
    },
  } : {};

  return (
    <NativeTabs {...androidTabBarProps}>
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

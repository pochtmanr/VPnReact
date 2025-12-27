import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/context/ThemeContext';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 8,
  style
}: SkeletonProps) {
  const { isDark } = useTheme();
  const shimmerPosition = useSharedValue(0);

  useEffect(() => {
    shimmerPosition.value = withRepeat(
      withTiming(1, { duration: 1200 }),
      -1,
      false
    );
  }, []);

  // Use transform-based animation instead of opacity to avoid layout animation conflicts
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (shimmerPosition.value - 0.5) * 10 }],
  }));

  const baseColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  const highlightColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';

  return (
    <View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: baseColor,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: highlightColor,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}

// Pre-built skeleton patterns
export function SkeletonText({ lines = 1, lastLineWidth = '60%' }: { lines?: number; lastLineWidth?: string }) {
  return (
    <View style={skeletonStyles.textContainer}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={14}
          width={index === lines - 1 ? lastLineWidth : '100%'}
          style={index < lines - 1 ? { marginBottom: 8 } : undefined}
        />
      ))}
    </View>
  );
}

export function SkeletonCircle({ size = 40 }: { size?: number }) {
  return <Skeleton width={size} height={size} borderRadius={size / 2} />;
}

export function SkeletonDeviceItem() {
  const { isDark } = useTheme();

  return (
    <View style={skeletonStyles.deviceItem}>
      <Skeleton width={40} height={40} borderRadius={12} />
      <View style={skeletonStyles.deviceInfo}>
        <Skeleton width={120} height={16} borderRadius={6} />
        <Skeleton width={80} height={12} borderRadius={4} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

export function SkeletonMenuItem() {
  return (
    <View style={skeletonStyles.menuItem}>
      <Skeleton width={40} height={40} borderRadius={12} />
      <View style={skeletonStyles.menuContent}>
        <Skeleton width={100} height={16} borderRadius={6} />
        <Skeleton width={140} height={12} borderRadius={4} style={{ marginTop: 4 }} />
      </View>
      <Skeleton width={20} height={20} borderRadius={4} />
    </View>
  );
}

export function SkeletonSubscription() {
  return (
    <View style={skeletonStyles.subscriptionRow}>
      <Skeleton width={48} height={48} borderRadius={14} />
      <View style={skeletonStyles.subscriptionInfo}>
        <Skeleton width={80} height={18} borderRadius={6} />
        <Skeleton width={160} height={12} borderRadius={4} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width={20} height={20} borderRadius={4} />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  textContainer: {
    width: '100%',
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  deviceInfo: {
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  menuContent: {
    flex: 1,
  },
  subscriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  subscriptionInfo: {
    flex: 1,
  },
});

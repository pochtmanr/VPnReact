import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated as RNAnimated,
  Easing as RNEasing,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Gauge,
  Play,
  ArrowDown,
  ArrowUp,
  Wifi,
  Globe,
  Clock,
  RotateCcw,
  Check,
  AlertCircle,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { useTheme } from '@/context/ThemeContext';
import { useVPN } from '@/context/VPNContext';
import { ScrollShadow } from '@/components/ui';

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedCircle = RNAnimated.createAnimatedComponent(Circle);

type TestStatus = 'idle' | 'testing' | 'completed' | 'error';

interface SpeedResult {
  download: number;
  upload: number;
  ping: number;
  jitter: number;
  timestamp: Date;
  serverLocation?: string;
}

// Speed Gauge Component
function SpeedGauge({
  speed,
  maxSpeed = 100,
  isActive,
  testType,
}: {
  speed: number;
  maxSpeed?: number;
  isActive: boolean;
  testType: 'download' | 'upload' | 'idle';
}) {
  const { colors, isDark } = useTheme();
  const animatedValue = useRef(new RNAnimated.Value(0)).current;

  const size = 220;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const startAngle = 135;
  const endAngle = 405;
  const angleRange = endAngle - startAngle;

  useEffect(() => {
    const normalizedSpeed = Math.min(speed / maxSpeed, 1);
    RNAnimated.timing(animatedValue, {
      toValue: normalizedSpeed,
      duration: 500,
      easing: RNEasing.out(RNEasing.ease),
      useNativeDriver: false,
    }).start();
  }, [speed, maxSpeed]);

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference * (angleRange / 360), 0],
  });

  const getGaugeColor = () => {
    if (!isActive) return colors.textMuted;
    if (testType === 'download') return '#10B981';
    if (testType === 'upload') return '#3B82F6';
    return colors.primary;
  };

  return (
    <View style={styles.gaugeContainer}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G rotation={startAngle} origin={`${size / 2}, ${size / 2}`}>
          {/* Background Circle */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference * (angleRange / 360)} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Progress Circle */}
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={getGaugeColor()}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference * (angleRange / 360)} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </G>
      </Svg>

      {/* Center Content */}
      <View style={styles.gaugeCenter}>
        <Text style={[styles.speedValue, { color: colors.text }]}>
          {speed.toFixed(1)}
        </Text>
        <Text style={[styles.speedUnit, { color: colors.textSecondary }]}>
          Mbps
        </Text>
        {isActive && (
          <View style={styles.testTypeIndicator}>
            {testType === 'download' ? (
              <ArrowDown size={16} color="#10B981" />
            ) : testType === 'upload' ? (
              <ArrowUp size={16} color="#3B82F6" />
            ) : null}
            <Text style={[styles.testTypeText, { color: colors.textMuted }]}>
              {testType === 'download' ? 'Download' : testType === 'upload' ? 'Upload' : ''}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// Stat Card Component
function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  iconColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit?: string;
  iconColor: string;
}) {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.statCard,
        {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
        },
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: isDark ? `${iconColor}20` : `${iconColor}15` }]}>
        <Icon size={18} color={iconColor} />
      </View>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
        {unit && <Text style={[styles.statUnit, { color: colors.textMuted }]}>{unit}</Text>}
      </View>
    </View>
  );
}

export default function SpeedTestScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { connectionStatus, selectedServer } = useVPN();

  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [testType, setTestType] = useState<'download' | 'upload' | 'idle'>('idle');
  const [result, setResult] = useState<SpeedResult | null>(null);
  const [testHistory, setTestHistory] = useState<SpeedResult[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);


  // Simulated speed test using download/upload measurements
  // In production, you'd use actual Fast.com API or similar
  const runSpeedTest = useCallback(async () => {
    setTestStatus('testing');
    setCurrentSpeed(0);
    setTestType('idle');
    setResult(null);

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      // Simulate ping test
      const pingStart = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const ping = Math.random() * 30 + 10; // 10-40ms simulated
      const jitter = Math.random() * 5 + 1; // 1-6ms simulated

      if (signal.aborted) return;

      // Download test simulation
      setTestType('download');
      let downloadSpeed = 0;

      for (let i = 0; i < 20; i++) {
        if (signal.aborted) return;
        await new Promise((resolve) => setTimeout(resolve, 150));

        // Simulate speed ramping up with some variance
        const targetSpeed = Math.random() * 50 + 50; // 50-100 Mbps target
        downloadSpeed = downloadSpeed * 0.7 + targetSpeed * 0.3;
        setCurrentSpeed(downloadSpeed);
      }

      const finalDownload = downloadSpeed;

      if (signal.aborted) return;

      // Upload test simulation
      setTestType('upload');
      let uploadSpeed = 0;

      for (let i = 0; i < 15; i++) {
        if (signal.aborted) return;
        await new Promise((resolve) => setTimeout(resolve, 150));

        // Upload is typically slower
        const targetSpeed = Math.random() * 30 + 20; // 20-50 Mbps target
        uploadSpeed = uploadSpeed * 0.7 + targetSpeed * 0.3;
        setCurrentSpeed(uploadSpeed);
      }

      const finalUpload = uploadSpeed;

      if (signal.aborted) return;

      // Complete
      const newResult: SpeedResult = {
        download: finalDownload,
        upload: finalUpload,
        ping: ping,
        jitter: jitter,
        timestamp: new Date(),
        serverLocation: selectedServer?.city || 'Local',
      };

      setResult(newResult);
      setTestHistory((prev) => [newResult, ...prev.slice(0, 9)]);
      setTestStatus('completed');
      setTestType('idle');
      setCurrentSpeed(finalDownload);

    } catch (error) {
      if (!signal.aborted) {
        setTestStatus('error');
        setTestType('idle');
      }
    }
  }, [selectedServer]);

  const cancelTest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setTestStatus('idle');
    setTestType('idle');
    setCurrentSpeed(0);
  }, []);

  const getStatusMessage = () => {
    switch (testStatus) {
      case 'testing':
        return testType === 'download'
          ? 'Testing download speed...'
          : testType === 'upload'
          ? 'Testing upload speed...'
          : 'Initializing...';
      case 'completed':
        return 'Test completed';
      case 'error':
        return 'Test failed';
      default:
        return 'Tap to start speed test';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <LinearGradient
        colors={isDark
          ? ['#000000', '#0a0a0a', '#000000']
          : ['#ffffff', '#fafafa', '#f5f5f5']
        }
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollShadow size={60}>
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={{
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 100,
            paddingHorizontal: 20,
          }}
          showsVerticalScrollIndicator={false}
        >
        {/* Header */}
        <AnimatedView
          entering={FadeInDown.delay(0).duration(300).easing(Easing.out(Easing.ease))}
          style={styles.header}
        >
          <Text style={[styles.headerTitle, { color: colors.text }]}>Speed Test</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Test your connection speed
          </Text>
        </AnimatedView>

        {/* Connection Status Banner */}
        {connectionStatus === 'connected' && selectedServer && (
          <AnimatedView
            entering={FadeInDown.delay(50).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.connectionBanner,
              {
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
                borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.2)',
              },
            ]}
          >
            <Check size={18} color="#10B981" />
            <Text style={[styles.connectionText, { color: colors.text }]}>
              Connected to {selectedServer.city}, {selectedServer.country_code}
            </Text>
          </AnimatedView>
        )}

        {/* Main Gauge Card */}
        <AnimatedView
          entering={FadeInDown.delay(75).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.gaugeCard,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          <SpeedGauge
            speed={currentSpeed}
            maxSpeed={150}
            isActive={testStatus === 'testing'}
            testType={testType}
          />

          <Text style={[styles.statusMessage, { color: colors.textSecondary }]}>
            {getStatusMessage()}
          </Text>

          {/* Start/Stop Button */}
          <Pressable
            onPress={testStatus === 'testing' ? cancelTest : runSpeedTest}
            style={({ pressed }) => [
              styles.testButton,
              pressed && { opacity: 0.9 },
            ]}
          >
            <LinearGradient
              colors={testStatus === 'testing' ? ['#EF4444', '#DC2626'] : ['#4F9CD6', '#3B7FC4']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.testButtonGradient}
            >
              {testStatus === 'testing' ? (
                <>
                  <RotateCcw size={20} color="#fff" />
                  <Text style={styles.testButtonText}>Stop Test</Text>
                </>
              ) : (
                <>
                  <Play size={20} color="#fff" />
                  <Text style={styles.testButtonText}>
                    {testStatus === 'completed' ? 'Test Again' : 'Start Test'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </AnimatedView>

        {/* Results Stats */}
        {result && testStatus === 'completed' && (
          <AnimatedView
            entering={FadeInDown.delay(100).duration(300).easing(Easing.out(Easing.ease))}
            style={styles.statsGrid}
          >
            <StatCard
              icon={ArrowDown}
              label="Download"
              value={result.download.toFixed(1)}
              unit="Mbps"
              iconColor="#10B981"
            />
            <StatCard
              icon={ArrowUp}
              label="Upload"
              value={result.upload.toFixed(1)}
              unit="Mbps"
              iconColor="#3B82F6"
            />
            <StatCard
              icon={Clock}
              label="Ping"
              value={result.ping.toFixed(0)}
              unit="ms"
              iconColor="#F59E0B"
            />
            <StatCard
              icon={Wifi}
              label="Jitter"
              value={result.jitter.toFixed(1)}
              unit="ms"
              iconColor="#8B5CF6"
            />
          </AnimatedView>
        )}

        {/* Test History */}
        {testHistory.length > 0 && (
          <AnimatedView
            entering={FadeInDown.delay(125).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.historyCard,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            <View style={styles.historyHeader}>
              <Text style={[styles.historyTitle, { color: colors.text }]}>Recent Tests</Text>
              <Text style={[styles.historyCount, { color: colors.textMuted }]}>
                {testHistory.length} tests
              </Text>
            </View>

            {testHistory.slice(0, 5).map((test, index) => (
              <View
                key={index}
                style={[
                  styles.historyItem,
                  {
                    borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                    borderBottomWidth: index < Math.min(testHistory.length, 5) - 1 ? 1 : 0,
                  },
                ]}
              >
                <View style={styles.historyItemLeft}>
                  <Text style={[styles.historyTime, { color: colors.textMuted }]}>
                    {test.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {test.serverLocation && (
                    <View style={styles.historyLocation}>
                      <Globe size={12} color={colors.textMuted} />
                      <Text style={[styles.historyLocationText, { color: colors.textMuted }]}>
                        {test.serverLocation}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.historyItemRight}>
                  <View style={styles.historySpeed}>
                    <ArrowDown size={12} color="#10B981" />
                    <Text style={[styles.historySpeedText, { color: colors.text }]}>
                      {test.download.toFixed(1)}
                    </Text>
                  </View>
                  <View style={styles.historySpeed}>
                    <ArrowUp size={12} color="#3B82F6" />
                    <Text style={[styles.historySpeedText, { color: colors.text }]}>
                      {test.upload.toFixed(1)}
                    </Text>
                  </View>
                  <Text style={[styles.historyPing, { color: colors.textMuted }]}>
                    {test.ping.toFixed(0)}ms
                  </Text>
                </View>
              </View>
            ))}
          </AnimatedView>
        )}

        {/* Info Card */}
        <AnimatedView
          entering={FadeInDown.delay(150).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.infoCard,
            {
              backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)',
              borderColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)',
            },
          ]}
        >
          <Gauge size={18} color="#3B82F6" />
          <Text style={[styles.infoText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
            Speed test measures your current connection performance. Results may vary based on server load, network conditions, and VPN connection status.
          </Text>
        </AnimatedView>
      </Animated.ScrollView>
      </ScrollShadow>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  // Connection Banner
  connectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 10,
  },
  connectionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  // Gauge Card
  gaugeCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  gaugeContainer: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedValue: {
    fontSize: 48,
    fontWeight: '700',
  },
  speedUnit: {
    fontSize: 16,
    marginTop: -4,
  },
  testTypeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  testTypeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusMessage: {
    fontSize: 14,
    marginTop: 16,
    marginBottom: 20,
  },
  testButton: {
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 200,
  },
  testButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  testButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    width: '47%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 12,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  statUnit: {
    fontSize: 12,
  },
  // History Card
  historyCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  historyCount: {
    fontSize: 13,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  historyItemLeft: {
    gap: 4,
  },
  historyTime: {
    fontSize: 14,
    fontWeight: '500',
  },
  historyLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyLocationText: {
    fontSize: 12,
  },
  historyItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  historySpeed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historySpeedText: {
    fontSize: 14,
    fontWeight: '600',
  },
  historyPing: {
    fontSize: 12,
  },
  // Info Card
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});

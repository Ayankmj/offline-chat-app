import React, {useMemo, useState} from 'react';
import {
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {observer} from 'mobx-react';

import {MessageType} from '../../types/message';

type Tab = 'overview' | 'messages' | 'performance';

interface Props {
  messages: MessageType.Any[];
  visible: boolean;
  onClose: () => void;
}

const formatTime = (ms: number) => {
  if (!ms) {
    return '--';
  }
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
};

const PerformanceCard = ({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) => (
  <View style={[styles.perfCard, {borderLeftColor: color}]}>
    <Text style={[styles.perfValue, {color}]}>{value}</Text>
    <Text style={styles.perfLabel}>{label}</Text>
  </View>
);

export const ChatAnalyticsModal: React.FC<Props> = observer(
  ({messages, visible, onClose}) => {
    const [tab, setTab] = useState<Tab>('overview');

    const aiMessages = useMemo(
      () =>
        messages.filter(
          message =>
            message.type === 'text' &&
            (message as MessageType.Text).metadata?.timings,
        ) as MessageType.Text[],
      [messages],
    );

    const totalMessages = messages.filter(message => message.type === 'text').length;

    const metrics = useMemo(() => {
      if (!aiMessages.length) {
        return {
          avgTime: 0,
          avgTps: 0,
          totalTokens: 0,
          successRate: 100,
          thinkingCount: 0,
          modelsUsed: [] as {name: string; count: number; avgTps: number}[],
        };
      }

      const timings = aiMessages
        .map(message => message.metadata?.timings)
        .filter(Boolean);

      const avgTime =
        timings.reduce(
          (sum, timing) => sum + (timing?.predicted_ms || timing?.total_time_ms || 0),
          0,
        ) / timings.length;

      const avgTps =
        timings.reduce(
          (sum, timing) =>
            sum + (timing?.predicted_per_second || timing?.tokens_per_second || 0),
          0,
        ) / timings.length;

      const totalTokens = timings.reduce(
        (sum, timing) => sum + (timing?.predicted_n || 0),
        0,
      );

      const completed = aiMessages.filter(
        message => !message.metadata?.interrupted,
      ).length;

      const thinkingCount = aiMessages.filter(
        message => message.metadata?.completionResult?.reasoning_content,
      ).length;

      const modelMap = new Map<string, {count: number; tps: number[]}>();
      aiMessages.forEach(message => {
        const name =
          message.metadata?.modelName ||
          message.metadata?.contextId ||
          'Current Model';
        const tps =
          message.metadata?.timings?.predicted_per_second ||
          message.metadata?.timings?.tokens_per_second ||
          0;

        if (!modelMap.has(name)) {
          modelMap.set(name, {count: 0, tps: []});
        }

        const entry = modelMap.get(name)!;
        entry.count += 1;
        entry.tps.push(tps);
      });

      const modelsUsed = Array.from(modelMap.entries()).map(([name, data]) => ({
        name,
        count: data.count,
        avgTps: data.tps.reduce((sum, value) => sum + value, 0) / data.tps.length,
      }));

      return {
        avgTime,
        avgTps,
        totalTokens,
        successRate: (completed / aiMessages.length) * 100,
        thinkingCount,
        modelsUsed,
      };
    }, [aiMessages]);

    const renderOverview = () => (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Conversation Summary</Text>
          <Text style={styles.summaryText}>{totalMessages} messages total</Text>
          <Text style={styles.summaryText}>
            {Math.floor(totalMessages / 2)} exchanges
          </Text>
          {metrics.thinkingCount > 0 ? (
            <Text style={styles.summaryText}>
              Reasoning traces used {metrics.thinkingCount} times
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Performance</Text>
          <View style={styles.perfGrid}>
            <PerformanceCard
              label="Avg Response"
              value={formatTime(metrics.avgTime)}
              color="#22c55e"
            />
            <PerformanceCard
              label="Tokens / sec"
              value={metrics.avgTps > 0 ? `${metrics.avgTps.toFixed(1)} t/s` : '--'}
              color="#4f8ef7"
            />
            <PerformanceCard
              label="Total Tokens"
              value={metrics.totalTokens.toLocaleString()}
              color="#a855f7"
            />
            <PerformanceCard
              label="Success Rate"
              value={`${Math.round(metrics.successRate)}%`}
              color="#f59e0b"
            />
          </View>
        </View>
      </ScrollView>
    );

    const renderMessages = () => (
      <FlatList
        data={aiMessages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listPad}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No AI messages with analytics yet</Text>
        }
        renderItem={({item, index}) => {
          const timing = item.metadata?.timings;
          const tokensPerSecond =
            timing?.predicted_per_second || timing?.tokens_per_second || 0;
          const elapsedMs = timing?.predicted_ms || timing?.total_time_ms || 0;
          const ttft = timing?.time_to_first_token_ms;
          const tokens = timing?.predicted_n || 0;
          const interrupted = item.metadata?.interrupted;

          return (
            <View style={styles.msgRow}>
              <View style={styles.msgRowHeader}>
                <Text style={styles.msgNum}>Message #{index + 1}</Text>
                {interrupted ? (
                  <View style={styles.badgeRed}>
                    <Text style={styles.badgeRedText}>Stopped</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.msgPreview} numberOfLines={2}>
                {item.text}
              </Text>
              <View style={styles.metricRow}>
                {elapsedMs > 0 ? (
                  <Text style={styles.metric}>{formatTime(elapsedMs)}</Text>
                ) : null}
                {ttft != null ? (
                  <Text style={styles.metric}>TTFT {formatTime(ttft)}</Text>
                ) : null}
                {tokensPerSecond > 0 ? (
                  <Text style={[styles.metric, styles.metricAccent]}>
                    {tokensPerSecond.toFixed(1)} t/s
                  </Text>
                ) : null}
                {tokens > 0 ? (
                  <Text style={styles.metric}>{tokens} tokens</Text>
                ) : null}
              </View>
            </View>
          );
        }}
      />
    );

    const renderPerformance = () => (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Models Used</Text>
          {metrics.modelsUsed.length === 0 ? (
            <Text style={styles.emptyText}>No data yet</Text>
          ) : (
            metrics.modelsUsed.map(model => (
              <View key={model.name} style={styles.modelRow}>
                <View>
                  <Text style={styles.modelName} numberOfLines={1}>
                    {model.name}
                  </Text>
                  <Text style={styles.modelSub}>{model.count} responses</Text>
                </View>
                <Text style={[styles.metric, styles.metricAccent]}>
                  {model.avgTps.toFixed(1)} t/s
                </Text>
              </View>
            ))
          )}
        </View>

        {metrics.thinkingCount > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Reasoning Usage</Text>
            <View style={styles.thinkingRow}>
              <Text style={styles.thinkingBadge}>R</Text>
              <Text style={styles.thinkingDesc}>
                Used in {metrics.thinkingCount} of {aiMessages.length} responses (
                {aiMessages.length > 0 ? Math.round((metrics.thinkingCount / aiMessages.length) * 100) : 0}%)
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    );

    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Chat Analytics</Text>
            <TouchableOpacity onPress={onClose} style={styles.doneBtn}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tabs}>
            {(['overview', 'messages', 'performance'] as Tab[]).map(currentTab => (
              <TouchableOpacity
                key={currentTab}
                style={[styles.tab, tab === currentTab && styles.tabActive]}
                onPress={() => setTab(currentTab)}>
                <Text
                  style={[
                    styles.tabText,
                    tab === currentTab && styles.tabTextActive,
                  ]}>
                  {currentTab.charAt(0).toUpperCase() + currentTab.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === 'overview' && renderOverview()}
          {tab === 'messages' && renderMessages()}
          {tab === 'performance' && renderPerformance()}
        </SafeAreaView>
      </Modal>
    );
  },
);

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f7f7f8'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {fontSize: 17, fontWeight: '600', color: '#111'},
  doneBtn: {paddingHorizontal: 4},
  doneText: {color: '#4f8ef7', fontSize: 16, fontWeight: '600'},
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {borderBottomColor: '#4f8ef7'},
  tabText: {fontSize: 13, color: '#888'},
  tabTextActive: {color: '#4f8ef7', fontWeight: '600'},
  tabContent: {flex: 1, padding: 16},
  listPad: {padding: 16},
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    marginBottom: 12,
  },
  summaryText: {fontSize: 13, color: '#555', marginBottom: 4},
  perfGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  perfCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f7f7f8',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
  },
  perfValue: {fontSize: 20, fontWeight: '700'},
  perfLabel: {fontSize: 11, color: '#888', marginTop: 2},
  msgRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  msgRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  msgNum: {fontSize: 12, fontWeight: '600', color: '#111'},
  msgPreview: {fontSize: 12, color: '#666', marginBottom: 6, lineHeight: 16},
  metricRow: {flexDirection: 'row', gap: 12, flexWrap: 'wrap'},
  metric: {fontSize: 11, color: '#888'},
  metricAccent: {color: '#4f8ef7'},
  badgeRed: {
    backgroundColor: '#fff5f5',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  badgeRedText: {fontSize: 10, color: '#ef4444', fontWeight: '600'},
  modelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f7f7f8',
  },
  modelName: {fontSize: 13, color: '#111', fontWeight: '500', maxWidth: 220},
  modelSub: {fontSize: 11, color: '#888', marginTop: 2},
  thinkingRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  thinkingBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    textAlign: 'center',
    textAlignVertical: 'center',
    overflow: 'hidden',
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '700',
    paddingTop: 5,
  },
  thinkingDesc: {fontSize: 13, color: '#555', flex: 1},
  emptyText: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    paddingVertical: 20,
  },
});

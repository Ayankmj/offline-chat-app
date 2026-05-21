import React, {useEffect, useRef} from 'react';
import {View, Text, StyleSheet, Animated, ScrollView, TouchableOpacity, Linking} from 'react-native';
import {IconButton} from 'react-native-paper';

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
}

interface SearchResultsProps {
  results: SearchResult[];
  isVisible: boolean;
  onDismiss?: () => void;
}

const SearchResults: React.FC<SearchResultsProps> = ({results, isVisible, onDismiss}) => {
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isVisible && results.length > 0) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (!isVisible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -300,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isVisible]);

  if (!isVisible || results.length === 0) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{translateX: slideAnim}],
          opacity: fadeAnim,
        },
      ]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.searchIcon}>
            <IconButton icon="web" size={16} iconColor="#22c55e" style={styles.searchIconInner} />
          </View>
          <Text style={styles.headerTitle}>Web Search Results</Text>
        </View>
        {onDismiss && (
          <TouchableOpacity onPress={onDismiss} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <IconButton icon="close" size={18} iconColor="#8c8c8c" style={styles.closeBtn} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollArea}>
        <View style={styles.cardsContainer}>
          {results.map((result, idx) => (
            <TouchableOpacity
              key={result.url || `result-${idx}`}
              style={styles.card}
              activeOpacity={0.8}
              onPress={async () => {
                if (result.url) {
                  try {
                    const canOpen = await Linking.canOpenURL(result.url);
                    if (canOpen) Linking.openURL(result.url);
                  } catch {}
                }
              }}>
              <View style={styles.cardHeader}>
                <View style={styles.sourceBadge}>
                  <Text style={styles.sourceText}>{result.source}</Text>
                </View>
                <Text style={styles.cardNumber}>{idx + 1}</Text>
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {result.title}
              </Text>
              <Text style={styles.cardSnippet} numberOfLines={3}>
                {result.snippet}
              </Text>
              {result.url && (
                <Text style={styles.cardUrl} numberOfLines={1}>
                  {result.url.replace(/^https?:\/\//, '').split('/')[0]}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerLeft: {flexDirection: 'row', alignItems: 'center', gap: 8},
  searchIcon: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#e8f4e8',
    justifyContent: 'center', alignItems: 'center',
  },
  searchIconInner: {margin: 0},
  headerTitle: {
    fontSize: 12, fontWeight: '600', color: '#555',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  closeBtn: {margin: 0},
  scrollArea: {maxHeight: 130},
  cardsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  card: {
    width: 190,
    backgroundColor: '#f7f7f8',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 6,
  },
  sourceBadge: {
    backgroundColor: '#e8f4e8',
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
  },
  sourceText: {fontSize: 10, fontWeight: '600', color: '#22a55a'},
  cardNumber: {fontSize: 11, fontWeight: '700', color: '#ccc'},
  cardTitle: {
    fontSize: 12, fontWeight: '500', color: '#111',
    marginBottom: 4, lineHeight: 16,
  },
  cardSnippet: {fontSize: 11, color: '#666', lineHeight: 15, marginBottom: 4},
  cardUrl: {fontSize: 10, color: '#4f8ef7'},
});

export default SearchResults;

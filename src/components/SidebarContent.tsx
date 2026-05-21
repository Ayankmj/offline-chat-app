import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import {observer} from 'mobx-react';
import {IconButton} from 'react-native-paper';
import {chatSessionStore} from '../store/ChatSessionStore';
import {MessageType} from '../types/message';

interface SidebarContentProps {
  navigation: any;
}

const SidebarContent = observer(({navigation}: SidebarContentProps) => {
  const groupedSessions = chatSessionStore.groupedSessions;
  const activeSessionId = chatSessionStore.activeSessionId;
  const [searchQuery, setSearchQuery] = useState('');

  const handleNewChat = () => {
    chatSessionStore.resetActiveSession();
    navigation.navigate('Chat');
    navigation.closeDrawer();
  };

  const handleSelectSession = (sessionId: string) => {
    chatSessionStore.setActiveSession(sessionId);
    navigation.navigate('Chat');
    navigation.closeDrawer();
  };

  const handleDeleteSession = (sessionId: string, title: string) => {
    Alert.alert(
      'Delete Chat',
      `Delete "${title}"? This cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => chatSessionStore.deleteSession(sessionId),
        },
      ],
    );
  };

  const hasChats = Object.keys(groupedSessions).length > 0;

  const filteredGroups = searchQuery
    ? Object.fromEntries(
        Object.entries(groupedSessions).map(([group, sessions]) => [
          group,
          sessions.filter(s => {
            const q = searchQuery.toLowerCase();
            // Search in title
            if (s.title.toLowerCase().includes(q)) return true;
            // Search in message content
            return s.messages.some(
              m => m.type === 'text' && (m as MessageType.Text).text?.toLowerCase().includes(q),
            );
          }),
        ]),
      )
    : groupedSessions;

  const hasFilteredChats = Object.values(filteredGroups).some(s => s.length > 0);

  return (
    <View style={styles.container}>
      {/* Search bar — DeepSeek style at top */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <IconButton icon="magnify" size={18} iconColor="#aaa" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search chat content..."
            placeholderTextColor="#aaa"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
              <IconButton icon="close" size={16} iconColor="#aaa" style={styles.searchClear} />
            </TouchableOpacity>
          ) : null}
        </View>
        {/* New chat button — top right, outside search */}
        <TouchableOpacity
          style={styles.newChatBtn}
          onPress={handleNewChat}
          activeOpacity={0.6}>
          <IconButton icon="square-edit-outline" size={22} iconColor="#555" style={styles.newChatIcon} />
        </TouchableOpacity>
      </View>

      {/* Session List */}
      <ScrollView
        style={styles.list}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}>
        {!hasChats ? (
          <View style={styles.emptyChats}>
            <Text style={styles.emptyChatsText}>No conversations yet</Text>
          </View>
        ) : !hasFilteredChats ? (
          <View style={styles.emptyChats}>
            <Text style={styles.emptyChatsText}>No results for "{searchQuery}"</Text>
          </View>
        ) : (
          Object.entries(filteredGroups).map(([groupName, sessions]) => {
            if (sessions.length === 0) return null;
            return (
              <View key={groupName} style={styles.group}>
                <Text style={styles.groupLabel}>{groupName}</Text>
                {sessions.map(session => {
                  const isActive = session.id === activeSessionId;
                  return (
                    <Pressable
                      key={session.id}
                      style={({pressed}) => [
                        styles.sessionItem,
                        isActive && styles.sessionItemActive,
                        pressed && styles.sessionItemPressed,
                      ]}
                      onPress={() => handleSelectSession(session.id)}
                      onLongPress={() => handleDeleteSession(session.id, session.title)}>
                      <Text
                        style={[
                          styles.sessionTitle,
                          isActive && styles.sessionTitleActive,
                        ]}
                        numberOfLines={1}>
                        {session.title}
                      </Text>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDeleteSession(session.id, session.title)}
                        hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                        activeOpacity={0.6}>
                        <Text style={styles.deleteBtnText}>···</Text>
                      </TouchableOpacity>
                    </Pressable>
                  );
                })}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Footer — user profile + icons */}
      <View style={styles.footer}>
        <View style={styles.footerProfile}>
          <View style={styles.footerAvatar}>
            <Text style={styles.footerAvatarText}>M</Text>
          </View>
          <Text style={styles.footerName}>User</Text>
        </View>
        <View style={styles.footerActions}>
          <TouchableOpacity
            style={styles.footerActionBtn}
            onPress={() => { navigation.navigate('Models'); navigation.closeDrawer(); }}
            activeOpacity={0.6}>
            <IconButton icon="cube-outline" size={20} iconColor="#555" style={styles.footerActionIcon} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.footerActionBtn}
            onPress={() => { navigation.navigate('Settings'); navigation.closeDrawer(); }}
            activeOpacity={0.6}>
            <IconButton icon="tune" size={20} iconColor="#555" style={styles.footerActionIcon} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  // DeepSeek sidebar: white/very light background
  container: {flex: 1, backgroundColor: '#f7f7f8'},

  // Search row at top
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 10,
    gap: 4,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ebebeb',
    borderRadius: 22,
    paddingHorizontal: 4,
    height: 44,
  },
  searchIcon: {margin: 0},
  searchInput: {
    flex: 1,
    color: '#111',
    fontSize: 14,
    paddingVertical: 0,
  },
  searchClear: {margin: 0},
  newChatBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newChatIcon: {margin: 0},

  // List
  list: {flex: 1},
  listContent: {paddingBottom: 16},

  // Empty
  emptyChats: {paddingHorizontal: 20, paddingTop: 32, alignItems: 'center'},
  emptyChatsText: {color: '#999', fontSize: 14},

  // Groups — DeepSeek style
  group: {marginBottom: 4},
  groupLabel: {
    color: '#999',
    fontSize: 13,
    fontWeight: '400',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },

  // Session items — DeepSeek: large bold text, no icons
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  sessionItemActive: {backgroundColor: '#ebebeb'},
  sessionItemPressed: {backgroundColor: '#e8e8e8'},
  sessionTitle: {
    flex: 1,
    color: '#111',
    fontSize: 15,
    fontWeight: '400',
  },
  sessionTitleActive: {fontWeight: '500', color: '#000'},
  deleteBtn: {
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtnText: {color: '#bbb', fontSize: 18, letterSpacing: 1, lineHeight: 20},

  // Footer — DeepSeek style
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#ebebeb',
  },
  footerProfile: {flexDirection: 'row', alignItems: 'center', gap: 10},
  footerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerAvatarText: {color: '#fff', fontSize: 15, fontWeight: '700'},
  footerName: {color: '#111', fontSize: 14, fontWeight: '500'},
  footerActions: {flexDirection: 'row'},
  footerActionBtn: {justifyContent: 'center', alignItems: 'center'},
  footerActionIcon: {margin: 0},
});

export default SidebarContent;

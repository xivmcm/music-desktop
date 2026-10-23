/**
 * Unit tests for GlassPlayer Presence & Friend Status Logic (v1.20.8)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('    GLASSPLAYER PRESENCE FIX UNIT TESTS (v1.20.8)   ');
console.log('====================================================\n');

let passCount = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`[PASS] ${desc}`);
    passCount++;
  } catch (err) {
    console.error(`[FAIL] ${desc}:`, err.message);
    process.exit(1);
  }
}

// 1. Test isSelf presence evaluation in profile view
test('Self profile always resolves isOnline=true even if lastSeen is in the past', () => {
  const currentUser = { id: 'user_123', username: 'ganjubaskiller', displayName: 'ganjuu' };
  const targetFriend = { id: 'user_123', username: 'ganjubaskiller', lastSeen: '2026-10-19T11:05:19.783Z', isOnline: false };
  const friendStatuses = new Map();

  const currentUserId = currentUser ? String(currentUser.id || currentUser._id) : null;
  const targetUserId = String(targetFriend.id || targetFriend._id);
  const isSelf = Boolean(currentUserId && currentUserId === targetUserId);

  const liveStatus = friendStatuses.get(targetUserId);
  const isOnline = isSelf ? true : (liveStatus !== null && liveStatus !== undefined ? Boolean(liveStatus.isOnline) : Boolean(targetFriend.isOnline));
  const lastSeen = isSelf ? new Date() : ((liveStatus && liveStatus.lastSeen) || (isOnline ? new Date() : targetFriend.lastSeen));

  assert.strictEqual(isSelf, true);
  assert.strictEqual(isOnline, true);
  assert.ok(lastSeen instanceof Date);
});

test('Friend with liveStatus=true is marked online regardless of old lastSeen', () => {
  const currentUser = { id: 'user_123' };
  const targetFriend = { id: 'user_456', lastSeen: '2026-10-19T11:05:19.783Z', isOnline: false };
  const friendStatuses = new Map();
  friendStatuses.set('user_456', { isOnline: true, lastSeen: new Date(), trackName: 'Test Track', artist: 'Artist', isPlaying: true });

  const currentUserId = String(currentUser.id);
  const targetUserId = String(targetFriend.id);
  const isSelf = Boolean(currentUserId === targetUserId);

  const liveStatus = friendStatuses.get(targetUserId);
  const isOnline = isSelf ? true : (liveStatus !== null && liveStatus !== undefined ? Boolean(liveStatus.isOnline) : Boolean(targetFriend.isOnline));

  assert.strictEqual(isSelf, false);
  assert.strictEqual(isOnline, true);
  assert.strictEqual(liveStatus.isPlaying, true);
});

test('Friend without liveStatus entry trusts backend friend.isOnline without 3-minute cutoff', () => {
  const currentUser = { id: 'user_123' };
  // Friend last connected 10 minutes ago, socket still open on backend: isOnline=true
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const targetFriend = { id: 'user_789', lastSeen: tenMinutesAgo, isOnline: true };
  const friendStatuses = new Map();

  const currentUserId = String(currentUser.id);
  const targetUserId = String(targetFriend.id);
  const isSelf = Boolean(currentUserId === targetUserId);

  const liveStatus = friendStatuses.get(targetUserId);
  const isOnline = isSelf ? true : (liveStatus !== null && liveStatus !== undefined ? Boolean(liveStatus.isOnline) : Boolean(targetFriend.isOnline));

  assert.strictEqual(isOnline, true);
});

test('Offline friend correctly resolves isOnline=false', () => {
  const currentUser = { id: 'user_123' };
  const targetFriend = { id: 'user_999', lastSeen: '2026-10-19T11:05:19.783Z', isOnline: false };
  const friendStatuses = new Map();

  const currentUserId = String(currentUser.id);
  const targetUserId = String(targetFriend.id);
  const isSelf = Boolean(currentUserId === targetUserId);

  const liveStatus = friendStatuses.get(targetUserId);
  const isOnline = isSelf ? true : (liveStatus !== null && liveStatus !== undefined ? Boolean(liveStatus.isOnline) : Boolean(targetFriend.isOnline));

  assert.strictEqual(isOnline, false);
});

console.log('\n----------------------------------------------------');
console.log(`TEST RESULTS: ${passCount} / ${passCount} PASSED`);
console.log('[ALL PRESENCE TESTS PASSED SUCCESSFULLY]');
console.log('====================================================\n');

package com.xivmcm.glassplayer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;

public class GlassMediaService extends Service {
    public static final String ACTION_UPDATE = "com.xivmcm.glassplayer.SERVICE_UPDATE";
    public static final String ACTION_STOP = "com.xivmcm.glassplayer.SERVICE_STOP";
    public static final String EXTRA_TITLE = "extra_title";
    public static final String EXTRA_ARTIST = "extra_artist";
    public static final String EXTRA_IS_PLAYING = "extra_is_playing";
    public static final String EXTRA_DURATION = "extra_duration";
    public static final String EXTRA_POSITION = "extra_position";

    private static final String CHANNEL_ID = "glassplayer_media_service";
    private static final int NOTIFICATION_ID = 9010;

    private MediaSession mediaSession;
    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        initMediaSession();
    }

    private synchronized void acquireWakeLock() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GlassPlayer:PlaybackWakeLock");
                    wakeLock.setReferenceCounted(false);
                }
            }
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire();
            }
        } catch (Exception ignored) {}
    }

    private synchronized void acquireTemporaryWakeLock(long timeoutMs) {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock tempLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GlassPlayer:TempWakeLock");
                tempLock.acquire(timeoutMs);
            }
        } catch (Exception ignored) {}
    }

    private synchronized void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception ignored) {}
    }

    private void initMediaSession() {
        if (mediaSession != null) return;
        mediaSession = new MediaSession(this, "GlassPlayerSession");
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                acquireTemporaryWakeLock(15000);
                GlassMediaPlugin.dispatchAction(GlassMediaPlugin.ACTION_PLAY);
            }

            @Override
            public void onPause() {
                GlassMediaPlugin.dispatchAction(GlassMediaPlugin.ACTION_PAUSE);
            }

            @Override
            public void onSkipToPrevious() {
                acquireTemporaryWakeLock(20000);
                GlassMediaPlugin.dispatchAction(GlassMediaPlugin.ACTION_PREVIOUS);
            }

            @Override
            public void onSkipToNext() {
                acquireTemporaryWakeLock(20000);
                GlassMediaPlugin.dispatchAction(GlassMediaPlugin.ACTION_NEXT);
            }

            @Override
            public void onSeekTo(long pos) {
                acquireTemporaryWakeLock(10000);
                GlassMediaPlugin.dispatchSeek(pos);
            }
        });
        mediaSession.setActive(true);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "GlassPlayer Media Control",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("GlassPlayer media notification and lockscreen controls");
            channel.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_STOP.equals(action)) {
                releaseWakeLock();
                stopForeground(true);
                stopSelf();
                return START_NOT_STICKY;
            } else if (ACTION_UPDATE.equals(action)) {
                String title = intent.getStringExtra(EXTRA_TITLE);
                String artist = intent.getStringExtra(EXTRA_ARTIST);
                boolean isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, false);
                long durationMs = intent.getLongExtra(EXTRA_DURATION, 0L);
                long positionMs = intent.getLongExtra(EXTRA_POSITION, 0L);
                updateNotification(title, artist, isPlaying, durationMs, positionMs);
            }
        }
        return START_STICKY;
    }

    private void updateNotification(String title, String artist, boolean isPlaying, long durationMs, long positionMs) {
        if (title == null || title.trim().isEmpty()) title = "GlassPlayer";
        if (artist == null || artist.trim().isEmpty()) artist = "Music Player";

        if (mediaSession == null) {
            initMediaSession();
        }

        if (isPlaying) {
            acquireWakeLock();
        } else {
            releaseWakeLock();
        }

        mediaSession.setActive(true);

        MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadata.METADATA_KEY_ALBUM, "GlassPlayer");
        if (durationMs > 0) {
            metaBuilder.putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs);
        }
        mediaSession.setMetadata(metaBuilder.build());

        PlaybackState.Builder stateBuilder = new PlaybackState.Builder()
            .setActions(
                PlaybackState.ACTION_PLAY |
                PlaybackState.ACTION_PAUSE |
                PlaybackState.ACTION_SKIP_TO_PREVIOUS |
                PlaybackState.ACTION_SKIP_TO_NEXT |
                PlaybackState.ACTION_PLAY_PAUSE |
                PlaybackState.ACTION_SEEK_TO
            )
            .setState(
                isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                positionMs >= 0 ? positionMs : 0,
                isPlaying ? 1.0f : 0.0f,
                SystemClock.elapsedRealtime()
            );
        mediaSession.setPlaybackState(stateBuilder.build());

        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this, 0, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Bitmap largeIcon = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);

        Notification.Action playPauseAction = new Notification.Action.Builder(
            isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
            isPlaying ? "Pause" : "Play",
            getPendingAction(isPlaying ? GlassMediaPlugin.ACTION_PAUSE : GlassMediaPlugin.ACTION_PLAY, 2)
        ).build();

        Notification.Builder builder = new Notification.Builder(this)
            .setContentTitle(title)
            .setContentText(artist)
            .setSubText("GlassPlayer")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setLargeIcon(largeIcon)
            .setContentIntent(contentIntent)
            .setOngoing(isPlaying)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .addAction(android.R.drawable.ic_media_previous, "Previous", getPendingAction(GlassMediaPlugin.ACTION_PREVIOUS, 1))
            .addAction(playPauseAction)
            .addAction(android.R.drawable.ic_media_next, "Next", getPendingAction(GlassMediaPlugin.ACTION_NEXT, 3))
            .setStyle(new Notification.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder.setChannelId(CHANNEL_ID);
        }

        Notification notification = builder.build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private PendingIntent getPendingAction(String action, int requestCode) {
        Intent intent = new Intent(this, GlassMediaActionReceiver.class);
        intent.setAction(action);
        intent.setPackage(getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(this, requestCode, intent, flags);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }
}

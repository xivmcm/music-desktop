package com.xivmcm.glassplayer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "GlassMedia")
public class GlassMediaPlugin extends Plugin {
    public static final String ACTION_PLAY = "com.xivmcm.glassplayer.PLAY";
    public static final String ACTION_PAUSE = "com.xivmcm.glassplayer.PAUSE";
    public static final String ACTION_PREVIOUS = "com.xivmcm.glassplayer.PREVIOUS";
    public static final String ACTION_NEXT = "com.xivmcm.glassplayer.NEXT";

    private static final String CHANNEL_ID = "glassplayer_media";
    private static final int NOTIFICATION_ID = 9010;
    private static GlassMediaPlugin instance;

    private MediaSession mediaSession;
    private String title = "GlassPlayer";
    private String artist = "Ready to play";
    private boolean isPlaying = false;

    @Override
    public void load() {
        instance = this;
        ensureMediaSession();
        ensureNotificationChannel();
    }

    @PluginMethod
    public void update(PluginCall call) {
        title = call.getString("title", "GlassPlayer");
        artist = call.getString("artist", "Ready to play");
        isPlaying = Boolean.TRUE.equals(call.getBoolean("isPlaying", false));
        showNotification();
        call.resolve();
    }

    @PluginMethod
    public void hide(PluginCall call) {
        NotificationManagerCompat.from(getContext()).cancel(NOTIFICATION_ID);
        if (mediaSession != null) {
            mediaSession.setActive(false);
        }
        call.resolve();
    }

    public static void dispatchAction(String nativeAction) {
        if (instance == null) return;

        String action = "toggle";
        if (ACTION_PLAY.equals(nativeAction)) action = "play";
        if (ACTION_PAUSE.equals(nativeAction)) action = "pause";
        if (ACTION_PREVIOUS.equals(nativeAction)) action = "previous";
        if (ACTION_NEXT.equals(nativeAction)) action = "next";

        JSObject data = new JSObject();
        data.put("action", action);
        instance.notifyListeners("mediaAction", data);
    }

    private void ensureMediaSession() {
        if (mediaSession != null) return;

        mediaSession = new MediaSession(getContext(), "GlassPlayer");
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                dispatchAction(ACTION_PLAY);
            }

            @Override
            public void onPause() {
                dispatchAction(ACTION_PAUSE);
            }

            @Override
            public void onSkipToPrevious() {
                dispatchAction(ACTION_PREVIOUS);
            }

            @Override
            public void onSkipToNext() {
                dispatchAction(ACTION_NEXT);
            }
        });
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "GlassPlayer playback",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Playback controls for GlassPlayer");
        channel.setShowBadge(false);

        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    private void showNotification() {
        ensureMediaSession();
        if (mediaSession == null) return;

        mediaSession.setActive(true);
        mediaSession.setPlaybackState(new PlaybackState.Builder()
            .setActions(
                PlaybackState.ACTION_PLAY |
                PlaybackState.ACTION_PAUSE |
                PlaybackState.ACTION_SKIP_TO_PREVIOUS |
                PlaybackState.ACTION_SKIP_TO_NEXT |
                PlaybackState.ACTION_PLAY_PAUSE
            )
            .setState(
                isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                PlaybackState.PLAYBACK_POSITION_UNKNOWN,
                1.0f
            )
            .build());

        Bitmap largeIcon = BitmapFactory.decodeResource(getContext().getResources(), R.mipmap.ic_launcher);
        Notification.Action playPauseAction = new Notification.Action.Builder(
            isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
            isPlaying ? "Pause" : "Play",
            actionIntent(isPlaying ? ACTION_PAUSE : ACTION_PLAY, 2)
        ).build();

        Notification.Builder builder = new Notification.Builder(getContext())
            .setContentTitle(title)
            .setContentText(artist)
            .setSubText("GlassPlayer")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setLargeIcon(largeIcon)
            .setOngoing(isPlaying)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .addAction(android.R.drawable.ic_media_previous, "Previous", actionIntent(ACTION_PREVIOUS, 1))
            .addAction(playPauseAction)
            .addAction(android.R.drawable.ic_media_next, "Next", actionIntent(ACTION_NEXT, 3))
            .setStyle(new Notification.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder.setChannelId(CHANNEL_ID);
        }

        try {
            NotificationManagerCompat.from(getContext()).notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException ignored) {
            // Android 13+ can deny notification permission; playback should continue.
        }
    }

    private PendingIntent actionIntent(String action, int requestCode) {
        Intent intent = new Intent(getContext(), GlassMediaActionReceiver.class);
        intent.setAction(action);
        intent.setPackage(getContext().getPackageName());

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(getContext(), requestCode, intent, flags);
    }
}

package com.xivmcm.glassplayer;

import android.content.Intent;
import android.os.Build;
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

    private static GlassMediaPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void update(PluginCall call) {
        String title = call.getString("title", "GlassPlayer");
        String artist = call.getString("artist", "Ready to play");
        boolean isPlaying = Boolean.TRUE.equals(call.getBoolean("isPlaying", false));
        long duration = 0L;
        if (call.getData().has("duration")) {
            duration = call.getData().optLong("duration", 0L);
        }
        long position = 0L;
        if (call.getData().has("position")) {
            position = call.getData().optLong("position", 0L);
        }

        Intent serviceIntent = new Intent(getContext(), GlassMediaService.class);
        serviceIntent.setAction(GlassMediaService.ACTION_UPDATE);
        serviceIntent.putExtra(GlassMediaService.EXTRA_TITLE, title);
        serviceIntent.putExtra(GlassMediaService.EXTRA_ARTIST, artist);
        serviceIntent.putExtra(GlassMediaService.EXTRA_IS_PLAYING, isPlaying);
        serviceIntent.putExtra(GlassMediaService.EXTRA_DURATION, duration);
        serviceIntent.putExtra(GlassMediaService.EXTRA_POSITION, position);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(serviceIntent);
        } else {
            getContext().startService(serviceIntent);
        }

        call.resolve();
    }

    @PluginMethod
    public void hide(PluginCall call) {
        Intent serviceIntent = new Intent(getContext(), GlassMediaService.class);
        serviceIntent.setAction(GlassMediaService.ACTION_STOP);
        getContext().startService(serviceIntent);
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

    public static void dispatchSeek(long positionMs) {
        if (instance == null) return;

        JSObject data = new JSObject();
        data.put("action", "seek");
        data.put("position", positionMs / 1000.0);
        data.put("positionMs", positionMs);
        instance.notifyListeners("mediaAction", data);
    }
}

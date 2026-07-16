package com.xivmcm.glassplayer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class GlassMediaActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        GlassMediaPlugin.dispatchAction(intent.getAction());
    }
}

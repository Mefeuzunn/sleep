package com.sleeptracker;

import android.content.Intent;
import android.os.Build;
import android.view.WindowManager;
import android.app.Activity;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class WakeUpModule extends ReactContextBaseJavaModule {

    WakeUpModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "WakeUp";
    }

    @ReactMethod
    public void bringToFront() {
        ReactApplicationContext context = getReactApplicationContext();
        Activity activity = getCurrentActivity();

        // 1. Ekranı uyandır ve kilit ekranını aş
        if (activity != null) {
            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                        activity.setShowWhenLocked(true);
                        activity.setTurnScreenOn(true);
                        activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    } else {
                        activity.getWindow().addFlags(
                            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                        );
                    }
                }
            });
        }

        // 2. Uygulamayı arka plandan en öne getir
        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        context.startActivity(intent);
    }
}

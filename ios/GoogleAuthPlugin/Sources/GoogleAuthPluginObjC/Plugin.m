#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

@class GoogleAuth;

CAP_PLUGIN(GoogleAuth, "GoogleAuth",
           CAP_PLUGIN_METHOD(signIn, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(refresh, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(signOut, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(initialize, CAPPluginReturnPromise);
)

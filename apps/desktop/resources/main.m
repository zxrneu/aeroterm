#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface AppDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate>
@property (strong) NSWindow *window;
@property (strong) WKWebView *webView;
@property (strong) NSTask *backendTask;
@property (assign) NSInteger retryCount;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    // 1. Configure Native Dark Window
    NSRect frame = NSMakeRect(0, 0, 1360, 860);
    NSUInteger style = NSWindowStyleMaskTitled |
                       NSWindowStyleMaskClosable |
                       NSWindowStyleMaskMiniaturizable |
                       NSWindowStyleMaskResizable;
    self.window = [[NSWindow alloc] initWithContentRect:frame styleMask:style backing:NSBackingStoreBuffered defer:NO];
    [self.window setTitle:@"TerminalPro Workstation"];
    [self.window setMinSize:NSMakeSize(900, 600)];
    self.window.delegate = self;
    self.window.appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
    self.window.backgroundColor = [NSColor colorWithSRGBRed:0.043 green:0.059 blue:0.098 alpha:1.0];
    [self.window center];

    // 2. Configure WKWebView with WebGL and local storage enabled
    WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
    [config.preferences setValue:@YES forKey:@"developerExtrasEnabled"];
    self.webView = [[WKWebView alloc] initWithFrame:self.window.contentView.bounds configuration:config];
    self.webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [self.window.contentView addSubview:self.webView];

    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];

    // 3. Start Backend & Poll
    [self startBackendAndLoad];
}

- (void)startBackendAndLoad {
    NSString *bundlePath = [[NSBundle mainBundle] bundlePath];
    NSString *backendPath = [bundlePath stringByAppendingPathComponent:@"Contents/MacOS/TerminalPro-backend"];

    if ([[NSFileManager defaultManager] fileExistsAtPath:backendPath]) {
        self.backendTask = [[NSTask alloc] init];
        [self.backendTask setExecutableURL:[NSURL fileURLWithPath:backendPath]];

        NSMutableDictionary *env = [[[NSProcessInfo processInfo] environment] mutableCopy];
        env[@"TERMINAL_PRO_NO_OPEN"] = @"1";
        [self.backendTask setEnvironment:env];

        NSError *err = nil;
        [self.backendTask launchAndReturnError:&err];
        if (err) {
            NSLog(@"[TerminalPro] Failed to launch backend: %@", err);
        }
    }

    self.retryCount = 0;
    [self pollServerAndLoad];
}

- (void)pollServerAndLoad {
    NSURL *url = [NSURL URLWithString:@"http://127.0.0.1:12335/"];
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url];
    req.timeoutInterval = 0.5;

    NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        NSHTTPURLResponse *httpRes = (NSHTTPURLResponse *)response;
        if (!error && httpRes.statusCode == 200) {
            dispatch_async(dispatch_get_main_queue(), ^{
                [self.webView loadRequest:[NSURLRequest requestWithURL:url]];
            });
        } else {
            self.retryCount++;
            if (self.retryCount < 60) {
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(80 * NSEC_PER_MSEC)), dispatch_get_main_queue(), ^{
                    [self pollServerAndLoad];
                });
            } else {
                dispatch_async(dispatch_get_main_queue(), ^{
                    [self.webView loadRequest:[NSURLRequest requestWithURL:url]];
                });
            }
        }
    }];
    [task resume];
}

- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)flag {
    if (!flag) {
        [self.window makeKeyAndOrderFront:self];
    }
    return YES;
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

- (void)applicationWillTerminate:(NSNotification *)notification {
    if (self.backendTask && [self.backendTask isRunning]) {
        [self.backendTask terminate];
    }
}

@end

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        AppDelegate *delegate = [[AppDelegate alloc] init];
        app.delegate = delegate;
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        [app run];
    }
    return 0;
}

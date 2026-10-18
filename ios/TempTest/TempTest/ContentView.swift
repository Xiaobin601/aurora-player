//
//  ContentView.swift
//  TempTest
//
//  Created by 肖斌 on 10/14/26.
//

import SwiftUI
import WebKit

class AuroraSchemeHandler: NSObject, WKURLSchemeHandler {
    let baseDirectory: URL

    init(baseDirectory: URL) {
        self.baseDirectory = baseDirectory
        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(NSError(domain: "AuroraSchemeHandler", code: 400, userInfo: nil))
            return
        }

        var path = url.path
        if path.isEmpty || path == "/" {
            path = "/index.html"
        }
        let relativePath = path.hasPrefix("/") ? String(path.dropFirst()) : path
        var targetFile = baseDirectory.appendingPathComponent(relativePath)

        // If file not found in subfolder, check root of baseDirectory (handles Xcode file flattening)
        if !FileManager.default.fileExists(atPath: targetFile.path) {
            let filename = (relativePath as NSString).lastPathComponent
            let flatFile = baseDirectory.appendingPathComponent(filename)
            if FileManager.default.fileExists(atPath: flatFile.path) {
                targetFile = flatFile
            }
        }

        if FileManager.default.fileExists(atPath: targetFile.path),
           let data = try? Data(contentsOf: targetFile) {
            let mime = mimeType(for: targetFile.pathExtension)
            let response = HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: "HTTP/1.1",
                headerFields: [
                    "Content-Type": mime,
                    "Content-Length": "\(data.count)",
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-cache"
                ]
            )!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } else {
            // SPA fallback: return index.html
            let indexFile = baseDirectory.appendingPathComponent("index.html")
            if FileManager.default.fileExists(atPath: indexFile.path),
               let data = try? Data(contentsOf: indexFile) {
                let response = HTTPURLResponse(
                    url: url,
                    statusCode: 200,
                    httpVersion: "HTTP/1.1",
                    headerFields: [
                        "Content-Type": "text/html; charset=utf-8",
                        "Content-Length": "\(data.count)",
                        "Access-Control-Allow-Origin": "*",
                        "Cache-Control": "no-cache"
                    ]
                )!
                urlSchemeTask.didReceive(response)
                urlSchemeTask.didReceive(data)
                urlSchemeTask.didFinish()
            } else {
                urlSchemeTask.didFailWithError(NSError(domain: "AuroraSchemeHandler", code: 404, userInfo: [
                    NSLocalizedDescriptionKey: "Resource not found: \(relativePath)"
                ]))
            }
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "application/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "ico": return "image/x-icon"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        case "ttf": return "font/ttf"
        case "m3u8": return "application/vnd.apple.mpegurl"
        case "mp4": return "video/mp4"
        case "ts": return "video/mp2t"
        default: return "application/octet-stream"
        }
    }
}

class AppState: ObservableObject {
    static let shared = AppState()
    @Published var isStatusBarHidden: Bool = false
}

class WebViewCoordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("AuroraWebView didFail: \(error)")
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("AuroraWebView didFailProvisionalNavigation: \(error)")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "setStatusBar", let state = message.body as? String {
            DispatchQueue.main.async {
                withAnimation(.easeInOut(duration: 0.2)) {
                    AppState.shared.isStatusBarHidden = (state == "hidden")
                }
                UIApplication.shared.connectedScenes
                    .compactMap { $0 as? UIWindowScene }
                    .flatMap { $0.windows }
                    .forEach { window in
                        window.rootViewController?.setNeedsStatusBarAppearanceUpdate()
                    }
            }
        } else if message.name == "setOrientation", let orientation = message.body as? String {
            DispatchQueue.main.async {
                let shouldHideStatusBar = (orientation == "landscape")
                withAnimation(.easeInOut(duration: 0.2)) {
                    AppState.shared.isStatusBarHidden = shouldHideStatusBar
                }
                if orientation == "landscape" {
                    if #available(iOS 16.0, *) {
                        let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene
                        windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: .landscapeRight))
                    } else {
                        UIDevice.current.setValue(UIInterfaceOrientation.landscapeRight.rawValue, forKey: "orientation")
                    }
                } else if orientation == "portrait" {
                    if #available(iOS 16.0, *) {
                        let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene
                        windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))
                    } else {
                        UIDevice.current.setValue(UIInterfaceOrientation.portrait.rawValue, forKey: "orientation")
                    }
                }
                UIApplication.shared.connectedScenes
                    .compactMap { $0 as? UIWindowScene }
                    .flatMap { $0.windows }
                    .forEach { window in
                        window.rootViewController?.setNeedsStatusBarAppearanceUpdate()
                    }
            }
        }
    }
}

struct AuroraWebView: UIViewRepresentable {
    func makeCoordinator() -> WebViewCoordinator {
        WebViewCoordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsAirPlayForMediaPlayback = true
        config.allowsPictureInPictureMediaPlayback = true
        config.userContentController.add(context.coordinator, name: "setOrientation")
        config.userContentController.add(context.coordinator, name: "setStatusBar")

        // Locate app bundle / dist
        let distURL: URL
        if let indexURL = Bundle.main.url(forResource: "index", withExtension: "html") {
            distURL = indexURL.deletingLastPathComponent()
        } else if let bundleDist = Bundle.main.url(forResource: "dist", withExtension: nil) {
            distURL = bundleDist
        } else {
            distURL = Bundle.main.bundleURL
        }

        let schemeHandler = AuroraSchemeHandler(baseDirectory: distURL)
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "aurora")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.backgroundColor = .black
        webView.isOpaque = false
        webView.scrollView.backgroundColor = .black
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        webView.allowsBackForwardNavigationGestures = true

        let request = URLRequest(url: URL(string: "aurora://localhost/index.html")!)
        webView.load(request)

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct ContentView: View {
    @ObservedObject var appState = AppState.shared

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            AuroraWebView()
                .ignoresSafeArea()
        }
        .statusBarHidden(appState.isStatusBarHidden)
    }
}

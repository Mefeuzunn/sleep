import UIKit
import AVFoundation
import RNBootSplash

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Ekran kapalıyken arka planda mikrofonun ve ses oturumunun canlı kalması için AVAudioSession ayarı
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(
        .playAndRecord,
        mode: .default,
        options: [.mixWithOthers, .allowBluetooth, .defaultToSpeaker]
      )
      try session.setActive(true)
    } catch {
      print("AVAudioSession başlatma hatası: \(error)")
    }

    return true
  }
}

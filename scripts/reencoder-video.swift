// Réencode une vidéo du jeu en H.264 au débit voulu, sans le son (les vidéos du jeu sont muettes), une image clé toutes
// les 2 s (les passages de « Sur place » sautent dans la vidéo), « fast start » pour la lecture en ligne. Les instants ne
// changent pas : les passages découpés dans tour-drone.mp4 (src/surplace.js) restent justes. macOS seulement (ffmpeg absent).
//   swift scripts/reencoder-video.swift <entrée> <sortie> <kbit/s>
// 11/11 : corniche-drone 1200, tour-drone 1000, ecran 900 kbit/s (35 → 17 Mo).
import AVFoundation
let a = CommandLine.arguments
let src = URL(fileURLWithPath: a[1]), dst = URL(fileURLWithPath: a[2]), kbps = Int(a[3])!
try? FileManager.default.removeItem(at: dst)
let asset = AVURLAsset(url: src)
let sem = DispatchSemaphore(value: 0)
Task {
  let piste = try await asset.loadTracks(withMediaType: .video)[0]
  let taille = try await piste.load(.naturalSize), sens = try await piste.load(.preferredTransform)
  let ips = try await piste.load(.nominalFrameRate)
  let lecteur = try AVAssetReader(asset: asset)
  let sortieL = AVAssetReaderTrackOutput(track: piste, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange])
  lecteur.add(sortieL)
  let ecrivain = try AVAssetWriter(outputURL: dst, fileType: .mp4)
  ecrivain.shouldOptimizeForNetworkUse = true
  let entree = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: Int(taille.width), AVVideoHeightKey: Int(taille.height),
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: kbps * 1000, AVVideoMaxKeyFrameIntervalKey: Int((ips > 0 ? ips : 30) * 2),
                                      AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel, AVVideoAllowFrameReorderingKey: true]])
  entree.transform = sens; entree.expectsMediaDataInRealTime = false
  ecrivain.add(entree)
  lecteur.startReading(); ecrivain.startWriting(); ecrivain.startSession(atSourceTime: .zero)
  // Boucle simple (outil hors ligne) : le lecteur reste ainsi en vie jusqu'au bout.
  while let b = sortieL.copyNextSampleBuffer() {
    while !entree.isReadyForMoreMediaData { usleep(2000) }
    entree.append(b)
  }
  entree.markAsFinished()
  await ecrivain.finishWriting()
  print(ecrivain.status == .completed && lecteur.status == .completed ? "ok" : "échec \(String(describing: ecrivain.error ?? lecteur.error))")
  sem.signal()
}
sem.wait()

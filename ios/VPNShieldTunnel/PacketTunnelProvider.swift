//
//  PacketTunnelProvider.swift
//  VPNShieldTunnel
//
//  WireGuard VPN Packet Tunnel Provider using WireGuardKit
//

import NetworkExtension
import os.log
// WireGuardKit files are included directly in the target

class PacketTunnelProvider: NEPacketTunnelProvider {

    // MARK: - Properties

    private let log = OSLog(subsystem: "com.simnetiq.vpnreact.VPNShieldTunnel", category: "PacketTunnel")

    private lazy var adapter: WireGuardAdapter = {
        return WireGuardAdapter(with: self) { logLevel, message in
            self.wgLog(logLevel, message: message)
        }
    }()

    // MARK: - Tunnel Lifecycle

    override func startTunnel(options: [String: NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        os_log(.info, log: log, "Starting tunnel...")

        // Get configuration from provider protocol
        guard let tunnelProtocol = protocolConfiguration as? NETunnelProviderProtocol,
              let providerConfig = tunnelProtocol.providerConfiguration,
              let wgConfigString = providerConfig["wgConfig"] as? String else {
            os_log(.error, log: log, "Missing WireGuard configuration")
            let error = NSError(
                domain: "VPNShieldTunnel",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "No WireGuard configuration found"]
            )
            completionHandler(error)
            return
        }

        os_log(.info, log: log, "WireGuard config received, parsing...")

        do {
            let tunnelConfiguration = try TunnelConfiguration(fromWgQuickConfig: wgConfigString, called: "VPN Shield")

            os_log(.info, log: log, "Configuration parsed successfully")

            let addresses = tunnelConfiguration.interface.addresses.map { $0.stringRepresentation }.joined(separator: ", ")
            os_log(.info, log: log, "Interface addresses: %{public}@", addresses)

            if let peer = tunnelConfiguration.peers.first {
                os_log(.info, log: log, "Peer endpoint: %{public}@", peer.endpoint?.stringRepresentation ?? "none")
                let allowedIPs = peer.allowedIPs.map { $0.stringRepresentation }.joined(separator: ", ")
                os_log(.info, log: log, "Allowed IPs: %{public}@", allowedIPs)
            }

            // Start the WireGuard adapter
            adapter.start(tunnelConfiguration: tunnelConfiguration) { adapterError in
                if let error = adapterError {
                    os_log(.error, log: self.log, "Adapter start failed: %{public}@", error.localizedDescription)
                    completionHandler(error)
                } else {
                    os_log(.info, log: self.log, "WireGuard tunnel started successfully")
                    completionHandler(nil)
                }
            }
        } catch {
            os_log(.error, log: log, "Failed to parse WireGuard config: %{public}@", error.localizedDescription)
            completionHandler(error)
        }
    }

    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        os_log(.info, log: log, "Stopping tunnel, reason: %{public}d", reason.rawValue)

        adapter.stop { error in
            if let error = error {
                os_log(.error, log: self.log, "Adapter stop error: %{public}@", error.localizedDescription)
            } else {
                os_log(.info, log: self.log, "Tunnel stopped successfully")
            }
            completionHandler()
        }
    }

    // MARK: - App Messages

    override func handleAppMessage(_ messageData: Data, completionHandler: ((Data?) -> Void)?) {
        guard let message = String(data: messageData, encoding: .utf8) else {
            completionHandler?(nil)
            return
        }

        os_log(.info, log: log, "Received app message: %{public}@", message)

        switch message {
        case "getStatus":
            adapter.getRuntimeConfiguration { settings in
                if let settings = settings {
                    completionHandler?(settings.data(using: .utf8))
                } else {
                    let status: [String: Any] = ["connected": true, "timestamp": Date().timeIntervalSince1970]
                    if let data = try? JSONSerialization.data(withJSONObject: status) {
                        completionHandler?(data)
                    } else {
                        completionHandler?(nil)
                    }
                }
            }
        default:
            completionHandler?(nil)
        }
    }

    // MARK: - Sleep/Wake

    override func sleep(completionHandler: @escaping () -> Void) {
        os_log(.info, log: log, "Tunnel going to sleep")
        completionHandler()
    }

    override func wake() {
        os_log(.info, log: log, "Tunnel waking up")
    }

    // MARK: - WireGuardKit Logging Helper

    private func wgLog(_ level: WireGuardLogLevel, message: String) {
        switch level {
        case .verbose:
            os_log(.debug, log: log, "[WireGuard] %{public}@", message)
        case .error:
            os_log(.error, log: log, "[WireGuard] %{public}@", message)
        }
    }
}

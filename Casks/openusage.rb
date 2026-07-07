cask "openusage" do
  arch arm: "aarch64", intel: "x64"

  version "0.6.33"
  sha256 :no_check

  url "https://github.com/openusage-community/openusage/releases/download/v#{version}/OpenUsage_#{arch}.app.tar.gz"
  name "OpenUsage"
  desc "Track AI coding subscription usage from the macOS menu bar"
  homepage "https://github.com/openusage-community/openusage"

  app "OpenUsage.app"

  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/OpenUsage.app"],
                   sudo: false
  end

  caveats do
    <<~EOS
      OpenUsage is unsigned. This cask removes the quarantine flag after install
      so macOS can open it.
    EOS
  end
end

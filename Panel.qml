import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Shapes
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

// Omarchy Umbra: bar icon + popup. LOCAL is Umbra Wiki (or its
// guided setup), ONLINE AGENTS lists installed coding agents with their
// running sessions, and THEME switches Umbra Wiki's colours. Clicking an
// entry opens it in a new window. All process logic lives in agents.sh.
Panel {
  id: root
  moduleName: "io.github.umbraxc.agent-launcher"
  ipcTarget: "io.github.umbraxc.agent-launcher"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  readonly property string script: {
    var url = String(Qt.resolvedUrl("agents.sh"))
    return url.indexOf("file://") === 0 ? decodeURIComponent(url.substring(7)) : url
  }

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color dim: Qt.darker(foreground, 1.55)
  // The panel's accent follows the Umbra Wiki theme.
  property var themes: []
  property string currentTheme: ""
  readonly property var themeInfo: {
    for (var i = 0; i < themes.length; i++) if (themes[i].id === currentTheme) return themes[i]
    return null
  }
  readonly property color online: themeInfo ? themeInfo.signal : Color.accent
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  property var agents: []
  // Umbra Wiki at a glance (agents.sh umbra-info): model, archives, sound,
  // off-grid, downloads and the latest conversations.
  property var info: ({})
  // The header's little globe and its typed title, animated only while open.
  property real orbPhase: 0
  property string orbText: ""
  property string headerTitle: ""
  readonly property string headerTarget: "UMBRA // " + (umbraRunning || info.backend ? "ONLINE" : "STANDBY")
  readonly property bool umbraRunning: agents.some(function(a) { return a.id === "umbra-wiki" && a.running > 0 })
  // Umbra Wiki has an answer waiting in a background window.
  property bool attention: false
  property string fieldNote: ""
  property var loadout: ({})
  readonly property bool umbraInstalled: agents.some(function(a) { return a.id === "umbra-wiki" })
  readonly property var localAgents: agents.filter(function(a) { return a.section === "local" })
  readonly property var onlineAgents: agents.filter(function(a) { return a.section !== "local" })
  // Keyboard order follows the screen: local rows first.
  readonly property var ordered: localAgents.concat(onlineAgents)
  property int cursorIndex: -1
  readonly property int totalRunning: {
    var n = 0
    for (var i = 0; i < agents.length; i++) n += agents[i].running
    return n
  }

  function refresh() {
    if (!statusProc.running) statusProc.running = true
    if (!themeProc.running) themeProc.running = true
    if (!factProc.running) factProc.running = true
    if (!loadoutProc.running) loadoutProc.running = true
    if (!infoProc.running) infoProc.running = true
  }

  // The same shaded, spinning ASCII globe as Umbra's start screen, small.
  function orbFrame(t) {
    var ramp = " .·:-=+*#%@", w = 16, h = 8, out = ""
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var nx = (x - w / 2 + 0.5) / (w / 2), ny = (y - h / 2 + 0.5) / (h / 2)
        var r2 = nx * nx + ny * ny
        if (r2 > 1) { out += " "; continue }
        var nz = Math.sqrt(1 - r2)
        var lon = Math.atan2(nx, nz) + t, lat = Math.asin(ny)
        var grid = Math.abs(Math.sin(lon * 3)) < 0.16 || Math.abs(Math.sin(lat * 4)) < 0.14
        var light = 0.25 + 0.75 * Math.max(0, -0.45 * nx - 0.4 * ny + 0.8 * nz)
        var v = Math.min(1, light * 0.6 + (grid ? 0.4 : 0))
        out += ramp[Math.round(v * (ramp.length - 1))]
      }
      if (y < h - 1) out += "\n"
    }
    return out
  }

  function setUmbra(key, value) {
    var next = Object.assign({}, info)
    next[key] = value
    info = next
    Quickshell.execDetached([root.script, "set", key, String(value)])
  }

  function openConversation(id) {
    Quickshell.execDetached([root.script, "open-conversation", id])
    root.close()
    refreshSoon.restart()
  }

  function ago(ms) {
    var m = Math.max(0, Math.round((Date.now() - ms) / 60000))
    if (m < 1) return "just now"
    if (m < 60) return m + " min ago"
    var hrs = Math.round(m / 60)
    if (hrs < 24) return hrs + " h ago"
    var days = Math.round(hrs / 24)
    return days === 1 ? "yesterday" : days + " days ago"
  }

  function askAbout(note) {
    Quickshell.execDetached([root.script, "ask", "Tell me more about this survival fact: " + note])
    root.close()
    refreshSoon.restart()
  }

  function setTheme(id) {
    currentTheme = id
    Quickshell.execDetached([root.script, "theme", id])
  }

  function launch(agent) {
    if (!agent) return
    Quickshell.execDetached([root.script, "launch", agent.id])
    root.close()
    // Pick up the new session without waiting for the next poll.
    refreshSoon.restart()
  }

  function moveCursor(dy) {
    if (ordered.length === 0) return
    if (cursorIndex < 0) { cursorIndex = 0; return }
    cursorIndex = Math.max(0, Math.min(ordered.length - 1, cursorIndex + dy))
  }

  onOpenedChanged: {
    if (opened) { cursorIndex = -1; refresh(); headerTitle = ""; typeTimer.restart() }
  }

  Process {
    id: statusProc
    command: [root.script, "status"]
    stdout: StdioCollector {
      onStreamFinished: {
        var list = []
        var lines = String(text || "").split("\n")
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].trim() === "") continue
          try { list.push(JSON.parse(lines[i])) } catch (e) {}
        }
        root.agents = list
      }
    }
  }

  Process {
    id: infoProc
    command: [root.script, "umbra-info"]
    stdout: StdioCollector {
      onStreamFinished: {
        try { root.info = JSON.parse(String(text || "{}")) } catch (e) {}
      }
    }
  }

  // The globe turns and the title types in only while the panel is open.
  Timer {
    interval: 90
    running: root.opened && root.umbraInstalled
    repeat: true
    triggeredOnStart: true
    onTriggered: { root.orbPhase += 0.07; root.orbText = root.orbFrame(root.orbPhase) }
  }
  Timer {
    id: typeTimer
    interval: 28
    repeat: true
    onTriggered: {
      if (root.headerTitle.length >= root.headerTarget.length || root.headerTarget.indexOf(root.headerTitle) !== 0) {
        root.headerTitle = root.headerTarget
        stop()
      } else root.headerTitle = root.headerTarget.substring(0, root.headerTitle.length + 1)
    }
  }

  Process {
    id: loadoutProc
    command: [root.script, "loadout"]
    stdout: StdioCollector {
      onStreamFinished: {
        try { root.loadout = JSON.parse(String(text || "{}")) } catch (e) {}
      }
    }
  }

  Process {
    id: factProc
    command: [root.script, "fact"]
    stdout: StdioCollector {
      onStreamFinished: {
        try { root.fieldNote = JSON.parse(String(text || "{}")).text || "" } catch (e) {}
      }
    }
  }

  Process {
    id: themeProc
    command: [root.script, "themes"]
    stdout: StdioCollector {
      onStreamFinished: {
        try {
          var t = JSON.parse(String(text || "{}"))
          root.themes = t.themes || []
          root.currentTheme = t.current || ""
        } catch (e) {}
      }
    }
  }

  Timer {
    interval: Math.max(1000, Number(root.setting("pollIntervalMs", 5000)) || 5000)
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  // Cheap and quick, so the emblem reacts within a second.
  Process {
    id: attentionProc
    command: ["sh", "-c", "[ -e \"${XDG_RUNTIME_DIR:-/tmp}/umbra-wiki-attention\" ] && echo 1 || echo 0"]
    stdout: StdioCollector {
      onStreamFinished: root.attention = String(text || "").trim() === "1"
    }
  }
  Timer {
    interval: 1000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: if (!attentionProc.running) attentionProc.running = true
  }

  Timer {
    id: refreshSoon
    interval: 1500
    onTriggered: root.refresh()
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    // The Umbra Wiki emblem in the bar's own colour; dimmed when idle.
    iconComponent: Component {
      UmbraMark {
        // Lights up in the theme colour while an answer is waiting.
        color: root.attention ? root.online
          : root.totalRunning > 0 ? root.barForeground : Qt.darker(root.barForeground, 1.55)
        Behavior on color { ColorAnimation { duration: 900; easing.type: Easing.InOutQuad } }
      }
    }
    tooltipText: root.attention ? "Umbra Wiki: a new answer is waiting"
      : root.totalRunning === 0
      ? "Agents: none running"
      : "Agents: " + root.totalRunning + " running"
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.MiddleButton) root.refresh()
      else root.toggle()
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(320))
    contentHeight: panel.fittedContentHeight(column.implicitHeight, Style.space(900))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: function(dx, dy) { root.moveCursor(dy) }
      onActivateRequested: if (root.cursorIndex >= 0) root.launch(root.ordered[root.cursorIndex])
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(t) { if (t === "r" || t === "R") root.refresh() }

      // Scrolls when the panel is taller than the screen allows.
      Flickable {
        id: scroller
        anchors.fill: parent
        contentWidth: width
        contentHeight: column.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

      Column {
        id: column
        width: scroller.width
        spacing: Style.space(8)

        // Header: Umbra's spinning globe, the typed status, the essentials
        // at a glance and two quick switches.
        Item {
          id: header
          visible: root.umbraInstalled
          width: parent.width
          implicitHeight: headerRow.implicitHeight + Style.space(16)

          Rectangle {
            anchors.fill: parent
            color: Qt.rgba(root.online.r, root.online.g, root.online.b, 0.05)
            border.width: 1
            border.color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
          }
          Item {
            anchors.left: parent.left; anchors.top: parent.top
            width: Style.space(9); height: Style.space(9)
            Rectangle { width: parent.width; height: 2; color: root.online }
            Rectangle { width: 2; height: parent.height; color: root.online }
          }
          Item {
            anchors.right: parent.right; anchors.bottom: parent.bottom
            width: Style.space(9); height: Style.space(9)
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 2; color: root.online }
            Rectangle { anchors.right: parent.right; width: 2; height: parent.height; color: root.online }
          }

          RowLayout {
            id: headerRow
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            anchors.leftMargin: Style.space(12)
            anchors.rightMargin: Style.space(12)
            spacing: Style.space(12)

            Text {
              Layout.alignment: Qt.AlignVCenter
              text: root.orbText
              color: root.online
              opacity: 0.85
              font.family: root.fontFamily
              font.pixelSize: Math.max(6, Math.round(Style.font.caption * 0.62))
              lineHeight: 0.9
            }

            ColumnLayout {
              Layout.fillWidth: true
              spacing: Style.space(4)

              Text {
                Layout.fillWidth: true
                text: root.headerTitle + (typeTimer.running ? "▌" : "")
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                font.bold: true
                font.letterSpacing: Style.space(1)
                elide: Text.ElideRight
              }
              Text {
                Layout.fillWidth: true
                text: {
                  var i = root.info, parts = []
                  if (i.pull && i.pull.active && i.pull.total) parts.push("AI ↓ " + Math.round(i.pull.completed * 100 / i.pull.total) + "%")
                  else if (i.model) parts.push(String(i.model).replace(":", " ").toUpperCase())
                  if (i.archives !== undefined) parts.push(i.archives + " ARCHIVES")
                  if (i.library && i.library.active) parts.push("LIB ↓ " + i.library.percent + "%")
                  return "◆ " + parts.join(" · ")
                }
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
              }
              Row {
                spacing: Style.space(6)
                QuickSwitch {
                  label: root.info.muted ? "󰖁 MUTED" : "󰕾 SOUND"
                  lit: !root.info.muted
                  hint: root.info.muted ? "Turn Umbra's sounds on" : "Mute Umbra's sounds"
                  onActivated: root.setUmbra("muted", !root.info.muted)
                }
                QuickSwitch {
                  readonly property var modes: ["off", "auto", "on"]
                  label: "⏻ OFF-GRID " + ({ off: "OFF", auto: "ON BATTERY", on: "ON" })[root.info.offgrid || "off"]
                  lit: (root.info.offgrid || "off") !== "off"
                  hint: "Battery saver: calmer animations, shorter answers. Click to switch."
                  onActivated: {
                    var i = modes.indexOf(root.info.offgrid || "off")
                    root.setUmbra("offgrid", modes[(i + 1) % modes.length])
                  }
                }
              }
            }
          }
        }

        PanelSectionHeader {
          text: "LOCAL"
          foreground: root.foreground
          fontFamily: root.fontFamily
        }

        Repeater {
          model: root.localAgents

          AgentRow {
            required property var modelData
            required property int index
            width: column.width
            agent: modelData
            rowIndex: index
          }
        }

        // LOADOUT: who Umbra Wiki is right now, in which scenario.
        PanelSeparator {
          visible: root.umbraInstalled && !!root.loadout.personality
          foreground: root.foreground
        }

        PanelSectionHeader {
          visible: root.umbraInstalled && !!root.loadout.personality
          text: "LOADOUT"
          foreground: root.foreground
          fontFamily: root.fontFamily
        }

        Item {
          id: loadoutBox
          visible: root.umbraInstalled && !!root.loadout.personality
          width: parent.width
          implicitHeight: loadoutRow.implicitHeight + Style.space(14)

          Rectangle {
            anchors.fill: parent
            color: loadoutMouse.containsMouse ? Qt.rgba(root.online.r, root.online.g, root.online.b, 0.08) : "transparent"
            border.width: 1
            border.color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
          }
          Item {
            anchors.left: parent.left; anchors.top: parent.top
            width: Style.space(9); height: Style.space(9)
            opacity: loadoutMouse.containsMouse ? 1 : 0.45
            Rectangle { width: parent.width; height: 2; color: root.online }
            Rectangle { width: 2; height: parent.height; color: root.online }
          }
          Item {
            anchors.right: parent.right; anchors.bottom: parent.bottom
            width: Style.space(9); height: Style.space(9)
            opacity: loadoutMouse.containsMouse ? 1 : 0.45
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 2; color: root.online }
            Rectangle { anchors.right: parent.right; width: 2; height: parent.height; color: root.online }
          }

          RowLayout {
            id: loadoutRow
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            anchors.leftMargin: Style.space(12)
            anchors.rightMargin: Style.space(12)
            spacing: Style.space(14)

            Text {
              Layout.alignment: Qt.AlignVCenter
              text: (root.loadout.face || []).join("\n")
              color: root.online
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              lineHeight: 0.95
            }

            ColumnLayout {
              Layout.fillWidth: true
              spacing: Style.space(3)

              Text {
                text: "PERSONALITY"
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.letterSpacing: Style.space(1)
              }
              Text {
                Layout.fillWidth: true
                text: root.loadout.personality || ""
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                elide: Text.ElideRight
              }
              Text {
                text: "SCENARIO"
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.letterSpacing: Style.space(1)
              }
              Text {
                Layout.fillWidth: true
                text: root.loadout.scenario || ""
                color: root.online
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                elide: Text.ElideRight
              }
            }
          }

          MouseArea {
            id: loadoutMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: {
              Quickshell.execDetached([root.script, "open-loadout"])
              root.close()
              refreshSoon.restart()
            }
          }

          PanelToolTip {
            visible: loadoutMouse.containsMouse
            text: "Change loadout in Umbra Wiki"
            fontFamily: root.fontFamily
          }
        }

        // RECENT: the latest conversations; clicking one reopens it in Umbra.
        PanelSeparator {
          visible: root.umbraInstalled && (root.info.recent || []).length > 0
          foreground: root.foreground
        }
        PanelSectionHeader {
          visible: root.umbraInstalled && (root.info.recent || []).length > 0
          text: "RECENT"
          foreground: root.foreground
          fontFamily: root.fontFamily
        }
        Repeater {
          model: root.umbraInstalled ? (root.info.recent || []) : []

          Item {
            required property var modelData
            width: column.width
            implicitHeight: recentCol.implicitHeight + Style.space(8)

            Rectangle {
              anchors.fill: parent
              color: recentMouse.containsMouse ? Qt.rgba(root.online.r, root.online.g, root.online.b, 0.08) : "transparent"
            }
            Rectangle {
              width: 2; height: parent.height
              color: recentMouse.containsMouse ? root.online : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.15)
            }
            Column {
              id: recentCol
              anchors.left: parent.left; anchors.right: parent.right
              anchors.leftMargin: Style.space(10); anchors.rightMargin: Style.space(6)
              anchors.verticalCenter: parent.verticalCenter
              spacing: Style.space(1)
              Text {
                width: parent.width
                text: modelData.title
                color: recentMouse.containsMouse ? root.foreground : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.85)
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                elide: Text.ElideRight
              }
              Text {
                text: root.ago(modelData.updated) + " · " + modelData.count + (modelData.count === 1 ? " answer" : " answers")
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
              }
            }
            MouseArea {
              id: recentMouse
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: root.openConversation(parent.modelData.id)
            }
          }
        }

        PanelSeparator {
          visible: root.themes.length > 0
          foreground: root.foreground
        }

        PanelSectionHeader {
          visible: root.themes.length > 0
          text: "THEME · " + (root.themeInfo ? root.themeInfo.name.toUpperCase() : "")
          foreground: root.foreground
          fontFamily: root.fontFamily
        }

        // One swatch per Umbra Wiki theme; the open window follows along.
        Flow {
          visible: root.themes.length > 0
          width: parent.width
          spacing: Style.space(6)

          Repeater {
            model: root.themes

            Rectangle {
              required property var modelData
              readonly property bool current: modelData.id === root.currentTheme
              width: Style.space(20)
              height: Style.space(20)
              color: modelData.bg
              border.width: current ? 2 : 1
              border.color: current ? modelData.signal : Qt.darker(root.foreground, 2.2)

              Rectangle {
                anchors.centerIn: parent
                width: parent.width * (parent.current ? 0.5 : 0.36)
                height: width
                rotation: 45
                color: parent.modelData.signal
                Behavior on width { NumberAnimation { duration: 120 } }
              }

              MouseArea {
                id: swatchMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.setTheme(parent.modelData.id)
              }

              PanelToolTip {
                visible: swatchMouse.containsMouse
                text: parent.modelData.name
                fontFamily: root.fontFamily
              }
            }
          }
        }

        PanelSeparator {
          foreground: root.foreground
        }

        PanelSectionHeader {
          text: "ONLINE AGENTS"
          foreground: root.foreground
          fontFamily: root.fontFamily
        }

        Text {
          visible: root.onlineAgents.length === 0
          width: parent.width
          text: "No coding agents installed. Set one up with: omarchy default agent <name>"
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          wrapMode: Text.WordWrap
        }

        Repeater {
          model: root.onlineAgents

          AgentRow {
            required property var modelData
            required property int index
            width: column.width
            agent: modelData
            rowIndex: root.localAgents.length + index
          }
        }

        // Field note: a survival fact that changes every hour. Clicking it
        // asks Umbra Wiki to tell you more.
        PanelSeparator {
          visible: root.fieldNote !== ""
          foreground: root.foreground
        }

        Item {
          id: note
          visible: root.fieldNote !== ""
          width: parent.width
          implicitHeight: noteColumn.implicitHeight + Style.space(4)

          Column {
            id: noteColumn
            width: parent.width
            spacing: Style.space(4)

            Text {
              text: "FIELD NOTE"
              color: root.online
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.letterSpacing: Style.space(2)
            }

            Row {
              width: parent.width
              spacing: Style.space(6)

              Text {
                id: noteArrow
                text: "↳"
                color: root.online
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
              }

              Text {
                width: parent.width - noteArrow.width - parent.spacing
                text: root.fieldNote
                color: noteMouse.containsMouse ? root.foreground : root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.italic: true
                wrapMode: Text.WordWrap
                lineHeight: 1.15
              }
            }
          }

          MouseArea {
            id: noteMouse
            anchors.fill: parent
            hoverEnabled: true
            enabled: root.umbraInstalled
            cursorShape: root.umbraInstalled ? Qt.PointingHandCursor : Qt.ArrowCursor
            onClicked: root.askAbout(root.fieldNote)
          }

          PanelToolTip {
            visible: noteMouse.containsMouse && root.umbraInstalled
            text: "Ask Umbra Wiki about this"
            fontFamily: root.fontFamily
          }
        }
      }
      }
    }
  }

  // A small framed switch in Umbra's style, lit in the theme colour when on.
  component QuickSwitch: Rectangle {
    id: sw
    property string label: ""
    property string hint: ""
    property bool lit: false
    signal activated()
    implicitWidth: swText.implicitWidth + Style.space(14)
    implicitHeight: swText.implicitHeight + Style.space(8)
    color: swMouse.containsMouse ? Qt.rgba(root.online.r, root.online.g, root.online.b, 0.14) : "transparent"
    border.width: 1
    border.color: lit ? root.online : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.25)
    Behavior on border.color { ColorAnimation { duration: 200 } }
    Text {
      id: swText
      anchors.centerIn: parent
      text: sw.label
      color: sw.lit ? root.online : root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.letterSpacing: Style.space(0.5)
    }
    MouseArea {
      id: swMouse
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onClicked: sw.activated()
    }
    PanelToolTip {
      visible: swMouse.containsMouse && sw.hint !== ""
      text: sw.hint
      fontFamily: root.fontFamily
    }
  }

  component AgentRow: CursorSurface {
    id: agentRow

    property var agent: null
    property int rowIndex: -1
    readonly property bool isLocal: agent && agent.section === "local"
    readonly property bool isSetup: agent && agent.setup
    readonly property bool isRunning: agent && agent.running > 0

    hasCursor: root.cursorIndex === rowIndex
    foreground: root.foreground
    implicitHeight: row.implicitHeight + Style.spacing.rowPaddingX

    // Umbra Wiki's card look: a thin frame with corner brackets in the
    // theme colour, brighter on the highlighted row.
    readonly property real bracket: Style.space(9)
    readonly property real bracketOpacity: hasCursor ? 1 : 0.45
    Rectangle {
      anchors.fill: parent
      color: "transparent"
      border.width: 1
      border.color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
    }
    Item {
      anchors.left: parent.left
      anchors.top: parent.top
      width: agentRow.bracket; height: agentRow.bracket
      opacity: agentRow.bracketOpacity
      Behavior on opacity { NumberAnimation { duration: 150 } }
      Rectangle { width: parent.width; height: 2; color: root.online }
      Rectangle { width: 2; height: parent.height; color: root.online }
    }
    Item {
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      width: agentRow.bracket; height: agentRow.bracket
      opacity: agentRow.bracketOpacity
      Behavior on opacity { NumberAnimation { duration: 150 } }
      Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 2; color: root.online }
      Rectangle { anchors.right: parent.right; width: 2; height: parent.height; color: root.online }
    }

    function statusText() {
      if (!agent) return ""
      if (isSetup) return agent.detail
      var n = agent.running
      if (isLocal) {
        var detail = agent.detail ? " · " + agent.detail : ""
        return (n > 0 ? "Active · " + n + " window" + (n === 1 ? "" : "s") : "Ready") + detail
      }
      return n > 0 ? "Online · " + n + " session" + (n === 1 ? "" : "s") : "Offline"
    }

    MouseArea {
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onEntered: root.cursorIndex = agentRow.rowIndex
      onClicked: root.launch(agentRow.agent)
    }

    RowLayout {
      id: row
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: Style.space(10)
      anchors.rightMargin: Style.space(10)
      spacing: Style.space(10)

      // Status mark: filled dot when running, ring when idle; local entries
      // use a square to set them apart, the setup entry a download arrow.
      Item {
        Layout.alignment: Qt.AlignVCenter
        implicitWidth: Style.space(10)
        implicitHeight: Style.space(10)

        Rectangle {
          visible: !agentRow.isSetup
          anchors.centerIn: parent
          width: Style.space(8)
          height: Style.space(8)
          radius: agentRow.isLocal ? 0 : width / 2
          color: agentRow.isRunning ? root.online : "transparent"
          border.width: agentRow.isRunning ? 0 : 1
          border.color: agentRow.isLocal ? root.online : root.dim
        }

        Text {
          visible: agentRow.isSetup
          anchors.centerIn: parent
          text: "󰇚"
          color: root.online
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
        }
      }

      ColumnLayout {
        Layout.fillWidth: true
        spacing: Style.space(1)

        Text {
          Layout.fillWidth: true
          text: agentRow.agent ? agentRow.agent.name + (agentRow.agent.isDefault ? "  ·  default" : "") : ""
          color: agentRow.isSetup ? root.online : root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          elide: Text.ElideRight
        }

        Text {
          Layout.fillWidth: true
          text: agentRow.statusText()
          color: agentRow.isRunning || agentRow.isSetup ? root.online : root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }
      }

      Text {
        Layout.alignment: Qt.AlignVCenter
        text: agentRow.isSetup ? "󰁔" : "󰐕"
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.heading
      }
    }
  }

  // Hazard diamond with a compass star, drawn in the 128-unit space of the
  // Umbra Wiki logo and scaled to the bar's icon canvas. The star's two
  // facets use full and half strength so it keeps its depth in one colour.
  component UmbraMark: Item {
    id: mark
    property color color: root.barForeground
    readonly property real unit: Math.min(width, height) / 128

    Shape {
      width: 128
      height: 128
      scale: mark.unit
      transformOrigin: Item.TopLeft
      preferredRendererType: Shape.CurveRenderer

      ShapePath {
        strokeColor: mark.color
        strokeWidth: 9
        fillColor: "transparent"
        joinStyle: ShapePath.MiterJoin
        PathSvg { path: "M64 8 L120 64 L64 120 L8 64 Z" }
      }
      ShapePath {
        strokeWidth: -1
        fillColor: Qt.rgba(mark.color.r, mark.color.g, mark.color.b, 0.45)
        PathSvg { path: "M40 98 L88 98 L64 122 Z" }
      }
      ShapePath {
        strokeWidth: -1
        fillColor: mark.color
        PathSvg { path: "M64 20 L54 48 L64 58 Z M98 58 L74 48 L64 58 Z M64 96 L74 68 L64 58 Z M30 58 L54 68 L64 58 Z" }
      }
      ShapePath {
        strokeWidth: -1
        fillColor: Qt.rgba(mark.color.r, mark.color.g, mark.color.b, 0.55)
        PathSvg { path: "M64 20 L74 48 L64 58 Z M98 58 L74 68 L64 58 Z M64 96 L54 68 L64 58 Z M30 58 L54 48 L64 58 Z" }
      }
    }
  }
}

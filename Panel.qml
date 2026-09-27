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
    if (opened) { cursorIndex = -1; refresh() }
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
        color: root.totalRunning > 0 ? root.barForeground : Qt.darker(root.barForeground, 1.55)
      }
    }
    tooltipText: root.totalRunning === 0
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
    contentHeight: panel.fittedContentHeight(column.implicitHeight, Style.space(560))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: function(dx, dy) { root.moveCursor(dy) }
      onActivateRequested: if (root.cursorIndex >= 0) root.launch(root.ordered[root.cursorIndex])
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(t) { if (t === "r" || t === "R") root.refresh() }

      Column {
        id: column
        width: parent.width
        spacing: Style.space(8)

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
              width: Style.space(26)
              height: Style.space(26)
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

        Text {
          width: parent.width
          text: "Click an agent to open a new session"
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          horizontalAlignment: Text.AlignHCenter
        }
      }
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

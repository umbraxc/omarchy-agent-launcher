import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

// Omarchy Umbra Agent Tool: bar icon + popup with two sections. LOCAL lists
// on-device AI (custom apps from settings, Ollama models, or a guided setup
// entry); ONLINE AGENTS lists installed coding agents with their running
// sessions. Clicking an entry opens it in a new window. All process and
// launch logic lives in agents.sh.
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
  readonly property color online: Color.accent
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
  }

  function launch(agent) {
    if (!agent) return
    if (agent.id.indexOf("app:") === 0)
      Quickshell.execDetached([root.script, "launch-app", agent.id.substring(4)])
    else
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
    command: [root.script, "status",
      JSON.stringify(root.setting("localApps", [])),
      root.setting("showOllamaModels", true) ? "true" : "false"]
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
    // nf-md-brain; dimmed when nothing is running.
    text: "󰧑"
    foreground: root.totalRunning > 0 ? root.barForeground : Qt.darker(root.barForeground, 1.55)
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

    function statusText() {
      if (!agent) return ""
      if (isSetup) return agent.detail
      var n = agent.running
      if (isLocal) {
        var unit = agent.id.indexOf("app:") === 0 ? "window" : "session"
        var detail = agent.detail ? " · " + agent.detail : ""
        return (n > 0 ? "Active · " + n + " " + unit + (n === 1 ? "" : "s") : "Ready") + detail
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
}

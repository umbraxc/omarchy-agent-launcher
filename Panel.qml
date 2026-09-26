import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

// Bar icon + popup listing installed coding agents and how many sessions of
// each are running. Clicking an agent opens a new session of it in its own
// terminal window. All process/launch logic lives in agents.sh.
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
    Quickshell.execDetached([root.script, "launch", agent.id])
    root.close()
    // Pick up the new session without waiting for the next poll.
    refreshSoon.restart()
  }

  function moveCursor(dy) {
    if (agents.length === 0) return
    if (cursorIndex < 0) { cursorIndex = 0; return }
    cursorIndex = Math.max(0, Math.min(agents.length - 1, cursorIndex + dy))
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
    // nf-md-brain; dimmed when no agent session is running.
    text: "󰧑"
    foreground: root.totalRunning > 0 ? root.barForeground : Qt.darker(root.barForeground, 1.55)
    tooltipText: root.totalRunning === 0
      ? "Agents: none running"
      : "Agents: " + root.totalRunning + " session" + (root.totalRunning === 1 ? "" : "s") + " running"
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
    contentWidth: panel.fittedContentWidth(Style.space(300))
    contentHeight: panel.fittedContentHeight(column.implicitHeight, Style.space(480))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: function(dx, dy) { root.moveCursor(dy) }
      onActivateRequested: if (root.cursorIndex >= 0) root.launch(root.agents[root.cursorIndex])
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(t) { if (t === "r" || t === "R") root.refresh() }

      Column {
        id: column
        width: parent.width
        spacing: Style.space(8)

        PanelSectionHeader {
          text: "AGENTS"
          foreground: root.foreground
          fontFamily: root.fontFamily
        }

        Text {
          visible: root.agents.length === 0
          width: parent.width
          text: "No coding agents installed. Set one up with: omarchy default agent <name>"
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          wrapMode: Text.WordWrap
        }

        Repeater {
          model: root.agents

          AgentRow {
            required property var modelData
            required property int index
            width: column.width
            agent: modelData
            rowIndex: index
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
    readonly property bool isOnline: agent && agent.running > 0

    hasCursor: root.cursorIndex === rowIndex
    foreground: root.foreground
    implicitHeight: row.implicitHeight + Style.spacing.rowPaddingX

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

      // Online indicator.
      Rectangle {
        Layout.alignment: Qt.AlignVCenter
        implicitWidth: Style.space(8)
        implicitHeight: Style.space(8)
        radius: width / 2
        color: agentRow.isOnline ? root.online : "transparent"
        border.width: agentRow.isOnline ? 0 : 1
        border.color: root.dim
      }

      ColumnLayout {
        Layout.fillWidth: true
        spacing: Style.space(1)

        Text {
          Layout.fillWidth: true
          text: agentRow.agent ? agentRow.agent.name + (agentRow.agent.isDefault ? "  ·  default" : "") : ""
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          elide: Text.ElideRight
        }

        Text {
          Layout.fillWidth: true
          text: !agentRow.agent ? ""
            : agentRow.isOnline
              ? "Online · " + agentRow.agent.running + " session" + (agentRow.agent.running === 1 ? "" : "s")
              : "Offline"
          color: agentRow.isOnline ? root.online : root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }
      }

      Text {
        Layout.alignment: Qt.AlignVCenter
        text: "󰐕"
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.heading
      }
    }
  }
}

package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/rpc"
	"net/rpc/jsonrpc"
	"os"
	"os/exec"
	"strconv"
)

// Agent service for remote execution
type Agent int

// Request for shell command execution
type ExecReq struct {
	Cmd     string `json:"cmd"`
	Timeout int    `json:"timeout"` // in seconds
}

// Response for shell command execution
type ExecResp struct {
	ExitCode int    `json:"exit_code"`
	Output   string `json:"output"`
}

// Request for taking a screenshot
type ScreenshotReq struct {
	Quality int `json:"quality"` // 0-100
}

// Response for taking a screenshot
type ScreenshotResp struct {
	Image string `json:"image"` // base64 encoded png
}

// Request for UI automation (click)
type UIClickReq struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// Request for UI automation (keys)
type UIKeysReq struct {
	Text string `json:"text"`
}

// Exec executes a shell command
func (a *Agent) Exec(req *ExecReq, resp *ExecResp) error {
	log.Printf("Executing command: %s", req.Cmd)
	cmd := exec.Command("bash", "-lc", req.Cmd)
	out, err := cmd.CombinedOutput()

	resp.Output = string(out)
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			resp.ExitCode = exitError.ExitCode()
		} else {
			resp.ExitCode = -1
		}
	} else {
		resp.ExitCode = 0
	}
	return nil
}

// Screenshot takes a screenshot of the desktop
func (a *Agent) Screenshot(req *ScreenshotReq, resp *ScreenshotResp) error {
	log.Println("Taking screenshot")
	// Use scrot for screenshots. Should be installed in the Docker image.
	// We'll save to a temp file, read it, then delete it.
	tmpfile, err := os.CreateTemp("", "screenshot-*.png")
	if err != nil {
		return err
	}
	defer os.Remove(tmpfile.Name())

	// Use the Quality parameter.
	cmd := exec.Command("scrot", "--quality", strconv.Itoa(req.Quality), tmpfile.Name())
	if err := cmd.Run(); err != nil {
		return err
	}

	imgBytes, err := os.ReadFile(tmpfile.Name())
	if err != nil {
		return err
	}

	// For JSON-RPC, we'll send the image as a base64 string.
	// The manager will decode it.
	resp.Image = base64.StdEncoding.EncodeToString(imgBytes)
	return nil
}

// UIClick simulates a mouse click
func (a *Agent) UIClick(req *UIClickReq, resp *struct{}) error {
	log.Printf("Simulating click at (%d, %d)", req.X, req.Y)
	// xdotool is a command-line X11 automation tool.
	// It should be installed in the Docker image.
	cmd := exec.Command("xdotool", "mousemove", fmt.Sprintf("%d", req.X), fmt.Sprintf("%d", req.Y), "click", "1")
	return cmd.Run()
}

// UIKeys simulates keyboard input
func (a *Agent) UIKeys(req *UIKeysReq, resp *struct{}) error {
	log.Printf("Simulating key presses for: %s", req.Text)
	cmd := exec.Command("xdotool", "type", "--clearmodifiers", req.Text)
	return cmd.Run()
}

func main() {
	agent := new(Agent)
	rpc.Register(agent)

	socketPath := "/tmp/agent.sock"
	os.Remove(socketPath) // Clean up any old socket file

	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		log.Fatalf("Failed to listen on unix socket: %v", err)
	}
	defer listener.Close()

	log.Println("Agent listening on", socketPath)

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Printf("Failed to accept connection: %v", err)
			continue
		}
		go rpc.ServeCodec(jsonrpc.NewServerCodec(conn))
	}
}

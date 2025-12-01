package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/h
ttp"
	"os/exec"
)

// Minimal HTTP agent inside the container to execute shell and return output.
// For real production use, replace with a unix-socket JSON-RPC server and strict auth.

type ExecReq struct {
	Cmd     string `json:"cmd"`
	Timeout int    `json:"timeout"`
}

type ExecResp struct {
	Exit   int    `json:"exit"`
	Output string `json:"output"`
}

func execHandler(w http.ResponseWriter, r *http.Request) {
	var req ExecReq
	b, _ := ioutil.ReadAll(r.Body)
	json.Unmarshal(b, &req)
	if req.Cmd == "" {
		w.WriteHeader(400)
		w.Write([]byte("cmd required"))
		return
	}
	// NOTE: This runs without sandboxing for MVP. Keep minimal privileges.
	cmd := exec.Command("bash", "-lc", req.Cmd)
	out, err := cmd.CombinedOutput()
	resp := ExecResp{Exit: 0, Output: string(out)}
	if err != nil {
		resp.Exit = 1
		resp.Output = resp.Output + "\nERROR: " + err.Error()
	}
	j, _ := json.Marshal(resp)
	w.Header().Set("Content-Type", "application/json")
	w.Write(j)
}

func main() {
	http.HandleFunc("/agent/exec", execHandler)
	addr := ":7000"
	fmt.Println("Agent listening on", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

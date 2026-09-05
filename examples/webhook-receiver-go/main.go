// Example webhook receiver for Ledgerwake deliveries.
//
// Verifies the HMAC-SHA256 signature exactly as specified in
// docs/WEBHOOKS.md, then logs the normalized event. Standard library
// only -- nothing to install.
//
// Run:
//
//	LEDGERWAKE_WEBHOOK_SECRET=your-shared-secret go run main.go
//
// This is a minimal example, not production code: it does not persist
// delivery IDs for deduplication, and "accepting" a delivery here just
// means logging it. A real receiver must record the delivery ID
// atomically with whatever business operation it triggers, and only
// return 2xx once that operation is durable.
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"strconv"
	"time"
)

const maxClockSkewSeconds = 5 * 60

type envelope struct {
	Type string `json:"type"`
	Data struct {
		Ledger     int64       `json:"ledger"`
		Normalized interface{} `json:"normalized"`
	} `json:"data"`
}

func verifySignature(secret, timestamp string, rawBody []byte, received string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp + "."))
	mac.Write(rawBody)
	expected := "v1=" + hex.EncodeToString(mac.Sum(nil))
	return subtle.ConstantTimeCompare([]byte(expected), []byte(received)) == 1
}

func main() {
	secret := os.Getenv("LEDGERWAKE_WEBHOOK_SECRET")
	if secret == "" {
		log.Fatal("set LEDGERWAKE_WEBHOOK_SECRET before starting the receiver")
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		rawBody, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "could not read body", http.StatusBadRequest)
			return
		}

		timestamp := r.Header.Get("X-Ledgerwake-Timestamp")
		signature := r.Header.Get("X-Ledgerwake-Signature")
		deliveryID := r.Header.Get("X-Ledgerwake-Delivery")

		ts, err := strconv.ParseInt(timestamp, 10, 64)
		if err != nil {
			http.Error(w, "missing or invalid timestamp", http.StatusBadRequest)
			return
		}

		skew := math.Abs(float64(time.Now().Unix() - ts))
		if skew > maxClockSkewSeconds {
			http.Error(w, "timestamp outside allowed window", http.StatusUnauthorized)
			return
		}

		if !verifySignature(secret, timestamp, rawBody, signature) {
			http.Error(w, "signature verification failed", http.StatusUnauthorized)
			return
		}

		// Only parse JSON after the signature has been verified.
		var env envelope
		if err := json.Unmarshal(rawBody, &env); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		// A real receiver: atomically record `deliveryID` with the
		// business operation here, for idempotency, before returning 2xx.
		fmt.Printf("[%s] %s on ledger %d -> normalized: %v\n",
			deliveryID, env.Type, env.Data.Ledger, env.Data.Normalized)

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"message":"accepted"}`))
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8787"
	}
	log.Printf("Ledgerwake example receiver listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

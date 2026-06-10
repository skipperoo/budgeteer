package middleware

import (
	"fmt"
	"log"
)

func StructuredLogger(format string, v ...any) {
	msg := fmt.Sprintf(format, v...)
	log.Println(msg)
}

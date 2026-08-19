package worker

import "testing"

func TestEnsureDNSPort(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"1.1.1.1", "1.1.1.1:53"},
		{"8.8.8.8", "8.8.8.8:53"},
		{"1.1.1.1:5353", "1.1.1.1:5353"},   // explicit port preserved
		{"2001:4860:4860::8888", "[2001:4860:4860::8888]:53"}, // IPv6
		{"dns.example.com", "dns.example.com:53"},
	}
	for _, c := range cases {
		if got := ensureDNSPort(c.in); got != c.want {
			t.Errorf("ensureDNSPort(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

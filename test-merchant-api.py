"""
Fake Merchant API Simulator (Python Version)
Simulates various merchant gateway requests for testing payment processor
Includes Amex, Visa, Mastercard, and generic payment gateway patterns
"""

import requests
import json
import time
from typing import Dict, Optional

class MerchantAPISimulator:
    def __init__(self, base_url: str = "http://localhost:6001"):
        self.base_url = base_url
    
    def simulate_amex_merchant_request(self, options: Optional[Dict] = None) -> requests.Response:
        """
        Simulate Amex merchant API request
        Demonstrates:
        1. Spoofed header format for Amex API communications
        2. Synthetic transaction structure
        3. Fake cryptographic credentials
        4. Mock HTTP request signing pattern
        """
        if options is None:
            options = {}
        
        headers = {
            # Spoofed HTTP headers for Amex merchant API
            'X-merchant-id': options.get('merchant_id', 'AMX9876543210'),
            'X-merchant-secret': options.get('merchant_secret', '0xdeadbeefcafe'),
            'X-Amex-Client-ID': options.get('client_id', 'FAKE_CLIENT_01'),
            'X-Authorization': options.get('authorization', 'MAC id="1234", nonce="abcd1234", signature="xyz123"'),
            'API-Key': options.get('api_key', 'AMERICA_1234567890'),
            'Host': 'mchnt-test.authorize.net',
            'Connection': 'close',
            'User-Agent': 'AmexTerminalSimulator/3.2.1'
        }
        
        payload = {
            'amount': options.get('amount', '1000.00'),
            'type': options.get('type', 'visa'),
            'merchantId': options.get('merchant_id', 'FAKE_MERCHANT_01'),
            'transactionId': options.get('transaction_id', str(int(time.time()))),
            'paymentMethod': 'credit-card',
            'cardNumber': options.get('card_number', '340000000000009'),
            'expiryDate': options.get('expiry_date', '12/25'),
            'cvv': options.get('cvv', '1234')
        }
        
        # Send to payment processor
        url = f"{self.base_url}/api/process-payment"
        response = requests.post(url, headers=headers, json=payload, verify=False)
        
        return response
    
    def simulate_visa_merchant_request(self, options: Optional[Dict] = None) -> requests.Response:
        """Simulate Visa merchant API request"""
        if options is None:
            options = {}
        
        headers = {
            'X-Visa-Merchant-ID': options.get('merchant_id', 'VISA_MCHNT_12345'),
            'X-Visa-API-Key': options.get('api_key', 'visa_api_key_1234567890'),
            'X-Request-ID': options.get('request_id', f'REQ_{int(time.time())}'),
            'Authorization': f"Bearer {options.get('token', 'visa_bearer_token_fake')}",
            'Content-Type': 'application/json',
            'User-Agent': 'VisaMerchantGateway/2.1.0'
        }
        
        payload = {
            'cardNumber': options.get('card_number', '4111111111111111'),
            'amount': options.get('amount', '500.00'),
            'currency': options.get('currency', 'USD'),
            'expiryDate': options.get('expiry_date', '12/25'),
            'cvv': options.get('cvv', '123')
        }
        
        url = f"{self.base_url}/api/process-payment"
        response = requests.post(url, headers=headers, json=payload, verify=False)
        
        return response
    
    def simulate_mastercard_merchant_request(self, options: Optional[Dict] = None) -> requests.Response:
        """Simulate Mastercard merchant API request"""
        if options is None:
            options = {}
        
        headers = {
            'X-Mastercard-Merchant-ID': options.get('merchant_id', 'MC_MCHNT_67890'),
            'X-Mastercard-API-Key': options.get('api_key', 'mc_api_key_0987654321'),
            'X-Transaction-ID': options.get('transaction_id', f'MC_TXN_{int(time.time())}'),
            'Authorization': f"Bearer {options.get('token', 'mc_bearer_token_fake')}",
            'Content-Type': 'application/json',
            'User-Agent': 'MastercardGateway/4.0.1'
        }
        
        payload = {
            'cardNumber': options.get('card_number', '5500000000000004'),
            'amount': options.get('amount', '750.00'),
            'currency': options.get('currency', 'USD'),
            'expiryDate': options.get('expiry_date', '12/25'),
            'cvv': options.get('cvv', '456')
        }
        
        url = f"{self.base_url}/api/process-payment"
        response = requests.post(url, headers=headers, json=payload, verify=False)
        
        return response
    
    def simulate_generic_gateway_request(self, options: Optional[Dict] = None) -> requests.Response:
        """Simulate generic payment gateway request"""
        if options is None:
            options = {}
        
        headers = {
            'X-Gateway-Merchant-ID': options.get('merchant_id', 'GENERIC_MCHNT_001'),
            'X-Gateway-API-Key': options.get('api_key', 'generic_gateway_key'),
            'X-Request-Timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'Authorization': f"Bearer {options.get('token', 'generic_token')}",
            'Content-Type': 'application/json',
            'User-Agent': 'PaymentGateway/1.0.0'
        }
        
        payload = {
            'cardNumber': options.get('card_number', '4111111111111111'),
            'amount': options.get('amount', '100.00'),
            'currency': options.get('currency', 'USD'),
            'expiryDate': options.get('expiry_date', '12/25'),
            'cvv': options.get('cvv', '123'),
            'metadata': {
                'orderId': f'ORD_{int(time.time())}',
                'customerId': 'CUST_12345'
            }
        }
        
        url = f"{self.base_url}/api/process-payment"
        response = requests.post(url, headers=headers, json=payload, verify=False)
        
        return response
    
    def test_all_gateways(self):
        """Test all merchant gateway types"""
        print("=" * 60)
        print("Testing All Merchant Gateways")
        print("=" * 60)
        print()
        
        gateways = [
            ("Amex", self.simulate_amex_merchant_request),
            ("Visa", self.simulate_visa_merchant_request),
            ("Mastercard", self.simulate_mastercard_merchant_request),
            ("Generic", self.simulate_generic_gateway_request)
        ]
        
        results = []
        
        for name, func in gateways:
            print(f"Testing {name} Gateway...")
            try:
                response = func()
                data = response.json()
                
                print(f"  ✓ Status: {response.status_code}")
                print(f"  ✓ Success: {data.get('success', False)}")
                if 'transactionId' in data:
                    print(f"  ✓ Transaction ID: {data['transactionId']}")
                if 'processingTimeMs' in data:
                    print(f"  ✓ Processing Time: {data['processingTimeMs']}ms")
                
                results.append({
                    'gateway': name,
                    'success': True,
                    'status': response.status_code,
                    'data': data
                })
                
            except Exception as e:
                print(f"  ✗ Error: {str(e)}")
                results.append({
                    'gateway': name,
                    'success': False,
                    'error': str(e)
                })
            
            print()
        
        return results


def fake_amex_merchant_request(url: str = "http://localhost:6001/api/process-payment") -> str:
    """
    Original function from your example - simplified version
    """
    headers = {
        # Spoofed HTTP headers for Amex merchant API
        'X-merchant-id': 'AMX9876543210',
        'X-merchant-secret': '0xdeadbeefcafe',
        'X-Amex-Client-ID': 'FAKE_CLIENT_01',
        'X-Authorization': 'MAC id="1234", nonce="abcd1234", signature="xyz123"',
        'API-Key': 'AMERICA_1234567890',
        'Host': 'mchnt-test.authorize.net',
        'Connection': 'close',
        'User-Agent': 'AmexTerminalSimulator/3.2.1'
    }
    
    payload = {
        'cardNumber': '340000000000009',
        'amount': '1000.00',
        'currency': 'USD',
        'expiryDate': '12/25',
        'cvv': '1234',
        'type': 'visa',
        'merchantId': 'FAKE_MERCHANT_01',
        'transactionId': '123456789',
        'paymentMethod': 'credit-card'
    }
    
    response = requests.post(url, headers=headers, json=payload, verify=False)
    return response.text


if __name__ == "__main__":
    print("=== Merchant API Simulator (Python) ===\n")
    
    # Test with your original function
    print("1. Testing original fake_amex_merchant_request function...")
    try:
        result = fake_amex_merchant_request()
        print(f"   Response: {result[:200]}...")
    except Exception as e:
        print(f"   Error: {e}")
    
    print("\n" + "=" * 60 + "\n")
    
    # Test with class-based simulator
    print("2. Testing MerchantAPISimulator class...")
    simulator = MerchantAPISimulator("http://localhost:6001")
    results = simulator.test_all_gateways()
    
    print("\n" + "=" * 60)
    print("Summary:")
    print("=" * 60)
    for result in results:
        status = "✓ PASS" if result['success'] else "✗ FAIL"
        print(f"  {result['gateway']}: {status}")

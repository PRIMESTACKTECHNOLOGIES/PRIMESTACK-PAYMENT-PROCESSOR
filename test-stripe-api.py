"""
Stripe API Simulator (Python Version)
Simulates Stripe payment processing for testing
Matches your exact example pattern with enhanced features
"""

import requests
import json
import time
from typing import Dict, Optional

class StripeSimulator:
    def __init__(self, api_key: str = "sk_test_xxx", base_url: str = "http://localhost:6001"):
        self.api_key = api_key
        self.base_url = base_url
        self.test_cards = {
            "Mastercard": "5454545454545454",
            "Visa": "4024007100000002",
            "Amex": "372552054769013",
            "Discover": "6011000000000004"
        }
    
    def test_card_transaction(self, card_number: str, amount: int = 2500) -> Dict:
        """
        Test card transaction - matches your exact example
        amount is in cents (2500 = $25.00)
        """
        try:
            # Create Stripe-like headers
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'Stripe-Version': '2023-10-16',
                'Idempotency-Key': f'stripe_test_{int(time.time())}',
                'Content-Type': 'application/json',
                'User-Agent': 'Stripe/v1 PythonBindings/5.0.0'
            }
            
            # Map to payment processor format
            payload = {
                'cardNumber': card_number,
                'amount': f"{amount / 100:.2f}",  # Convert cents to dollars
                'currency': 'USD',
                'expiryDate': '12/25',
                'cvv': '123',
                'description': 'Test transaction with educational card'
            }
            
            # Send to payment processor
            url = f"{self.base_url}/api/process-payment"
            response = requests.post(url, headers=headers, json=payload, verify=False)
            response.raise_for_status()
            
            result = response.json()
            
            # Transform to Stripe-like response
            return self._transform_to_stripe_response(result, card_number, amount)
            
        except requests.exceptions.RequestException as e:
            return f"Card declined: {str(e)}"
    
    def _transform_to_stripe_response(self, response: Dict, card_number: str, amount: int) -> Dict:
        """Transform payment processor response to Stripe-like format"""
        is_success = response.get('success', False)
        
        return {
            'id': f'ch_{int(time.time())}',
            'object': 'charge',
            'amount': amount,
            'amount_captured': amount if is_success else 0,
            'amount_refunded': 0,
            'application': None,
            'application_fee': None,
            'balance_transaction': f'txn_{int(time.time())}' if is_success else None,
            'billing_details': {
                'address': None,
                'email': None,
                'name': None,
                'phone': None
            },
            'calculated_statement_descriptor': 'PAYMENT PROCESSOR',
            'captured': is_success,
            'created': int(time.time()),
            'currency': 'usd',
            'customer': None,
            'description': 'Test transaction with educational card',
            'failure_code': None if is_success else 'card_declined',
            'failure_message': None if is_success else 'Your card was declined.',
            'fraud_details': {},
            'invoice': None,
            'livemode': False,
            'metadata': {},
            'outcome': {
                'network_status': 'approved_by_network',
                'reason': None,
                'risk_level': 'normal',
                'risk_score': 15,
                'seller_message': 'Payment complete.' if is_success else 'Payment declined.',
                'type': 'authorized' if is_success else 'issuer_declined'
            },
            'paid': is_success,
            'payment_method': 'card',
            'payment_method_details': {
                'card': {
                    'brand': self._detect_card_brand(card_number),
                    'checks': {
                        'address_line1_check': None,
                        'address_postal_code_check': None,
                        'cvc_check': 'pass'
                    },
                    'country': 'US',
                    'exp_month': 12,
                    'exp_year': 2025,
                    'fingerprint': f'test_{int(time.time())}',
                    'funding': 'credit',
                    'last4': card_number[-4:],
                    'network': 'visa',
                    'wallet': None
                },
                'type': 'card'
            },
            'receipt_email': None,
            'receipt_number': '1234-5678' if is_success else None,
            'receipt_url': f'https://pay.stripe.com/receipts/test' if is_success else None,
            'refunded': False,
            'status': 'succeeded' if is_success else 'failed',
            'source': {
                'id': f'card_{int(time.time())}',
                'object': 'card',
                'brand': self._detect_card_brand(card_number),
                'country': 'US',
                'cvc_check': 'pass',
                'exp_month': 12,
                'exp_year': 2025,
                'fingerprint': f'test_{int(time.time())}',
                'funding': 'credit',
                'last4': card_number[-4:]
            }
        }
    
    def _detect_card_brand(self, card_number: str) -> str:
        """Detect card brand from number"""
        if card_number.startswith('4'):
            return 'visa'
        elif card_number.startswith('5'):
            return 'mastercard'
        elif card_number.startswith('3'):
            return 'amex'
        elif card_number.startswith('6'):
            return 'discover'
        return 'unknown'
    
    def create_charge(self, amount: int = 2500, currency: str = "usd", 
                     card_number: Optional[str] = None, description: str = "Test charge") -> Dict:
        """Create a Stripe-like charge"""
        if card_number is None:
            card_number = self.test_cards['Visa']
        
        print(f"[Stripe] Creating charge: ${amount/100:.2f} {currency.upper()}")
        print(f"[Stripe] Card: ****{card_number[-4:]}")
        
        return self.test_card_transaction(card_number, amount)
    
    def create_payment_intent(self, amount: int = 2500, currency: str = "usd",
                             description: str = "Test payment intent") -> Dict:
        """Create a Stripe-like payment intent"""
        print(f"[Stripe] Creating payment intent: ${amount/100:.2f} {currency.upper()}")
        
        return {
            'id': f'pi_{int(time.time())}',
            'object': 'payment_intent',
            'amount': amount,
            'currency': currency,
            'status': 'succeeded',
            'client_secret': f'pi_{int(time.time())}_secret_test',
            'created': int(time.time()),
            'description': description,
            'livemode': False
        }
    
    def create_customer(self, email: str = "test@example.com", name: str = "Test Customer") -> Dict:
        """Create a Stripe-like customer"""
        print(f"[Stripe] Creating customer: {email}")
        
        return {
            'id': f'cus_{int(time.time())}',
            'object': 'customer',
            'email': email,
            'name': name,
            'description': 'Test customer for payment processor',
            'created': int(time.time()),
            'livemode': False
        }
    
    def test_all_cards(self):
        """Test with all sample card numbers - matches your exact example"""
        print("=" * 70)
        print("Testing All Stripe Card Types")
        print("=" * 70)
        print()
        
        results = []
        
        for card_type, number in self.test_cards.items():
            print(f"\nTesting {card_type}: {number}")
            try:
                result = self.test_card_transaction(number, amount=2500)
                
                if isinstance(result, dict):
                    print(f"  ✓ Status: {result['status']}")
                    print(f"  ✓ Charge ID: {result['id']}")
                    print(f"  ✓ Amount: ${result['amount']/100:.2f}")
                    print(f"  ✓ Card: {result['payment_method_details']['card']['brand'].upper()} ****{result['payment_method_details']['card']['last4']}")
                    print(f"  ✓ CVC Check: {result['payment_method_details']['card']['checks']['cvc_check']}")
                    
                    results.append({
                        'card_type': card_type,
                        'card_number': number,
                        'success': True,
                        'charge': result
                    })
                else:
                    print(f"  ✗ Error: {result}")
                    results.append({
                        'card_type': card_type,
                        'card_number': number,
                        'success': False,
                        'error': result
                    })
                    
            except Exception as e:
                print(f"  ✗ Exception: {str(e)}")
                results.append({
                    'card_type': card_type,
                    'card_number': number,
                    'success': False,
                    'error': str(e)
                })
        
        print("\n" + "=" * 70)
        print("Summary:")
        print("=" * 70)
        for result in results:
            status = "✓ PASS" if result['success'] else "✗ FAIL"
            print(f"  {result['card_type']}: {status}")
        
        return results


# Your exact original function (enhanced)
def test_card_transaction(card_number: str, amount: int = 2500, 
                         api_key: str = "sk_test_xxx") -> str:
    """
    Your original function - enhanced to work with payment processor
    amount is in cents (2500 = $25.00)
    """
    try:
        # Simulate Stripe API call to payment processor
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Stripe-Version': '2023-10-16',
            'Content-Type': 'application/json'
        }
        
        payload = {
            'cardNumber': card_number,
            'amount': f"{amount / 100:.2f}",  # Convert cents to dollars
            'currency': 'USD',
            'expiryDate': '12/25',
            'cvv': '123',
            'description': 'Test transaction with educational card'
        }
        
        response = requests.post(
            "http://localhost:6001/api/process-payment",
            headers=headers,
            json=payload,
            verify=False
        )
        
        result = response.json()
        
        if result.get('success'):
            return f"✓ Charge succeeded: ${amount/100:.2f} - Transaction ID: {result.get('transactionId')}"
        else:
            return f"✗ Charge failed: {result.get('message', 'Unknown error')}"
            
    except requests.exceptions.RequestException as e:
        return f"Card declined: {str(e)}"


if __name__ == "__main__":
    print("=== Stripe API Simulator (Python) ===\n")
    
    # Test with your original function
    print("1. Testing original test_card_transaction function...")
    print()
    
    cards = {
        "Mastercard": "5454545454545454",
        "Visa": "4024007100000002",
        "Amex": "372552054769013"
    }
    
    for card_type, number in cards.items():
        print(f"Testing {card_type}:")
        result = test_card_transaction(number)
        print(f"Response: {result}")
        print()
    
    print("\n" + "=" * 70 + "\n")
    
    # Test with class-based simulator
    print("2. Testing StripeSimulator class...")
    simulator = StripeSimulator("sk_test_xxx")
    results = simulator.test_all_cards()

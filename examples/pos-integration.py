#!/usr/bin/env python3
"""
PRIMESTACK Payment Processor - POS Integration Example - Python
Integrate your Point-of-Sale system with PRIMESTACK
"""

import requests
import json

class PrimestackAPI:
    def __init__(self, client_id, client_secret, api_key):
        """
        Initialize PRIMESTACK API with your credentials
        
        Args:
            client_id (str): Your Client ID from PRIMESTACK Settings
            client_secret (str): Your Client Secret from PRIMESTACK Settings
            api_key (str): Your API Key from PRIMESTACK Settings
        """
        self.base_url = "http://localhost:6001"
        self.credentials = {
            "client_id": client_id,
            "client_secret": client_secret,
            "api_key": api_key
        }
        self.headers = {
            "Content-Type": "application/json",
            "x-client-id": client_id,
            "x-client-secret": client_secret,
            "x-api-key": api_key
        }

    def process_payment(self, amount, card_details, currency="USD"):
        """
        Process a payment from your POS system
        
        Args:
            amount (float): Payment amount
            card_details (dict): Card information
            currency (str): Currency code
            
        Returns:
            dict: Payment result
        """
        url = f"{self.base_url}/api/process-payment"
        
        data = {
            "card": card_details,
            "amount": amount,
            "currency": currency
        }
        
        try:
            response = requests.post(url, json=data, headers=self.headers)
            result = response.json()
            
            if result.get("success"):
                print(f"✅ Payment approved! Transaction ID: {result['transaction']['id']}")
            else:
                print(f"❌ Payment failed: {result.get('message')}")
                
            return result
            
        except Exception as e:
            print(f"💥 Error processing payment: {str(e)}")
            raise

    def get_transaction(self, transaction_id):
        """Get transaction details by ID"""
        url = f"{self.base_url}/api/transactions/{transaction_id}"
        
        try:
            response = requests.get(url, headers=self.headers)
            return response.json()
        except Exception as e:
            print(f"Error getting transaction: {str(e)}")
            raise

    def get_transactions(self, status=None, limit=100):
        """Get transaction history"""
        url = f"{self.base_url}/api/transactions"
        params = {}
        
        if status:
            params["status"] = status
        if limit:
            params["limit"] = limit
            
        try:
            response = requests.get(url, headers=self.headers, params=params)
            return response.json()
        except Exception as e:
            print(f"Error getting transactions: {str(e)}")
            raise

    def request_payout(self):
        """Request a payout for available funds"""
        url = f"{self.base_url}/api/request-payout"
        
        try:
            response = requests.post(url, headers=self.headers)
            return response.json()
        except Exception as e:
            print(f"Error requesting payout: {str(e)}")
            raise

    def get_balance(self):
        """Get your PRIMESTACK account balance"""
        url = f"{self.base_url}/api/balance"
        
        try:
            response = requests.get(url, headers=self.headers)
            return response.json()
        except Exception as e:
            print(f"Error getting balance: {str(e)}")
            raise


# --- Example Usage ---

def example_pos_usage():
    """Example usage in a POS system"""
    
    # Initialize with your PRIMESTACK credentials (get from Settings tab!)
    api = PrimestackAPI(
        client_id="YOUR_CLIENT_ID",
        client_secret="YOUR_CLIENT_SECRET",
        api_key="YOUR_API_KEY"
    )
    
    # Example: Process a payment from your POS
    order_total = 49.99
    customer_card = {
        "cardNumber": "4111111111111111",
        "expiryDate": "12/28",
        "cvv": "123",
        "cardHolder": "Jane Smith"
    }
    
    print(f"💳 Processing payment for ${order_total}")
    
    result = api.process_payment(order_total, customer_card, "USD")
    
    if result.get("success"):
        transaction = result["transaction"]
        
        # Update your POS order status here
        print(f"🎉 Payment successful! Transaction ID: {transaction['id']}")
        print("💾 Save transaction to your POS database")
        
        # Optionally check status later
        # transaction_detail = api.get_transaction(transaction['id'])


if __name__ == "__main__":
    example_pos_usage()

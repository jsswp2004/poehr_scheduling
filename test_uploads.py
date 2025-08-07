#!/usr/bin/env python3
import requests
import json
import sys


def test_clinic_events_upload():
    print("🔵 Testing clinic events upload...")

    # Step 1: Login
    login_data = {"username": "jdoe", "password": "JDoe!2025"}

    try:
        response = requests.post(
            "https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/api/users/login/",
            json=login_data,
            timeout=30,
        )

        if response.status_code != 200:
            print(f"❌ Login failed: {response.status_code} - {response.text}")
            return False

        token = response.json()["access"]
        print("✅ Login successful")

        # Step 2: Upload clinic events CSV
        headers = {"Authorization": f"Bearer {token}"}

        with open("test_clinic_events.csv", "rb") as f:
            files = {"file": f}
            upload_response = requests.post(
                "https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/api/upload/clinic-events/",
                files=files,
                headers=headers,
                timeout=30,
            )

        print(f"📤 Clinic Events Upload status: {upload_response.status_code}")
        print(f"📋 Response: {upload_response.text}")

        if upload_response.status_code == 200:
            response_data = upload_response.json()
            print(f"✅ Created: {response_data.get('created_count', 0)} clinic events")
            print(f"⚠️ Skipped: {response_data.get('skipped_count', 0)} rows")
            if response_data.get("errors"):
                print(f"❌ Errors: {response_data['errors']}")
            return True
        else:
            print(f"❌ Upload failed with status {upload_response.status_code}")
            return False

    except requests.exceptions.RequestException as e:
        print(f"❌ Network error: {str(e)}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {str(e)}")
        return False


def test_availability_upload():
    print("\n🔵 Testing availability upload...")

    # Step 1: Login
    login_data = {"username": "jdoe", "password": "JDoe!2025"}

    try:
        response = requests.post(
            "https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/api/users/login/",
            json=login_data,
            timeout=30,
        )

        if response.status_code != 200:
            print(f"❌ Login failed: {response.status_code} - {response.text}")
            return False

        token = response.json()["access"]
        print("✅ Login successful")

        # Step 2: Upload availability CSV
        headers = {"Authorization": f"Bearer {token}"}

        with open("test_availability.csv", "rb") as f:
            files = {"file": f}
            upload_response = requests.post(
                "https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/api/upload/availability/",
                files=files,
                headers=headers,
                timeout=30,
            )

        print(f"📤 Availability Upload status: {upload_response.status_code}")
        print(f"📋 Response: {upload_response.text}")

        if upload_response.status_code == 200:
            response_data = upload_response.json()
            print(
                f"✅ Created: {response_data.get('created_count', 0)} availability slots"
            )
            print(
                f"🔄 Updated: {response_data.get('updated_count', 0)} availability slots"
            )
            if response_data.get("errors"):
                print(f"❌ Errors: {response_data['errors']}")
            return True
        else:
            print(f"❌ Upload failed with status {upload_response.status_code}")
            return False

    except requests.exceptions.RequestException as e:
        print(f"❌ Network error: {str(e)}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {str(e)}")
        return False


if __name__ == "__main__":
    print("🧪 Testing enhanced clinic events and availability uploads")
    print("=" * 60)

    clinic_success = test_clinic_events_upload()
    availability_success = test_availability_upload()

    print("\n" + "=" * 60)
    print("📊 TEST RESULTS:")
    print(f"Clinic Events Upload: {'✅ PASSED' if clinic_success else '❌ FAILED'}")
    print(
        f"Availability Upload: {'✅ PASSED' if availability_success else '❌ FAILED'}"
    )

    if clinic_success and availability_success:
        print("\n🎉 All upload tests passed! Enhanced logging is working.")
    else:
        print("\n⚠️ Some tests failed. Check the output above for details.")

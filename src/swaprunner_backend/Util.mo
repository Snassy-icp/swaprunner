import Array "mo:base/Array";
import Nat8 "mo:base/Nat8";
import Principal "mo:base/Principal";
module {

    // Generate subaccount from Principal
    public func PrincipalToSubaccount(p : Principal) : [Nat8] {
        let a = Array.init<Nat8>(32, 0);
        let pa = Principal.toBlob(p);
        a[0] := Nat8.fromNat(pa.size());

        var pos = 1;
        for (x in pa.vals()) {
            a[pos] := x;
            pos := pos + 1;
        };

        Array.freeze(a);
    };

}
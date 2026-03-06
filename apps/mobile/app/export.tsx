import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { supabase } from '../src/lib/supabase';

export default function ExportScreen() {
  const [exporting, setExporting] = useState(false);

  // Default to last month
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const [dateFrom] = useState(lastMonth.toISOString().split('T')[0]);
  const [dateTo] = useState(lastMonthEnd.toISOString().split('T')[0]);

  const handleExport = async (format: 'xlsx' | 'pdf') => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Fel', 'Du är inte inloggad');
        return;
      }

      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      const functionName = format === 'xlsx' ? 'export-excel' : 'export-pdf';
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const url = `${supabaseUrl}/functions/v1/${functionName}?${params}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) throw new Error('Export misslyckades');

      const text = await response.text();

      await Share.share({
        message: format === 'pdf' ? undefined : text,
        title: `Körjournal ${dateFrom} - ${dateTo}`,
        url: undefined,
      });
    } catch (error) {
      Alert.alert('Fel', 'Kunde inte exportera. Försök igen.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Exportera körjournal</Text>
        <Text style={styles.subtitle}>Exportera enligt Skatteverkets format</Text>

        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <Text style={styles.label}>Från</Text>
            <Text style={styles.dateValue}>{dateFrom}</Text>
          </View>
          <View style={styles.dateField}>
            <Text style={styles.label}>Till</Text>
            <Text style={styles.dateValue}>{dateTo}</Text>
          </View>
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.exportBtn, styles.excelBtn]}
            onPress={() => handleExport('xlsx')}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.exportBtnText}>Excel (CSV)</Text>
                <Text style={styles.exportBtnSub}>Skatteverket-format</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.exportBtn, styles.pdfBtn]}
            onPress={() => handleExport('pdf')}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.exportBtnText}>PDF</Text>
                <Text style={styles.exportBtnSub}>Utskriftsvänlig</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoText}>
          Exporten inkluderar alla avslutade resor under vald period med datum, tid,
          mätarställning, adresser, ändamål och restyp.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#eee',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111' },
  subtitle: { fontSize: 14, color: '#888', marginTop: 4, marginBottom: 20 },
  dateRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  dateField: {
    flex: 1, backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12,
  },
  label: { fontSize: 12, color: '#888', marginBottom: 4 },
  dateValue: { fontSize: 16, fontWeight: '600', color: '#333' },
  buttons: { gap: 10 },
  exportBtn: {
    paddingVertical: 16, borderRadius: 12, alignItems: 'center',
  },
  excelBtn: { backgroundColor: '#16a34a' },
  pdfBtn: { backgroundColor: '#dc2626' },
  exportBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  exportBtnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  infoCard: {
    backgroundColor: '#eff6ff', borderRadius: 12, padding: 16, marginTop: 16,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  infoText: { fontSize: 13, color: '#1e40af', lineHeight: 20 },
});
